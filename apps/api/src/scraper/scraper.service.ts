import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/// Grails' own public search API — no API key required for reads (see
/// apps/web/app/api/ensv1/grails-listings/route.ts, which documents the same finding).
/// This is exactly what's being scraped ahead of its reported discontinuation — see
/// docs/grails-migration.md.
const GRAILS_SEARCH_URL = "https://api.grails.app/api/v1/search";
const PAGE_SIZE = 50;

interface GrailsListingItem {
  price: string;
  currency_address: string;
  status: string;
  order_hash: string;
  seller_address: string;
  // Loosely typed and validated at runtime (isFulfillable below), not trusted — Grails-
  // native and OpenSea-mirrored results disagree on everything except protocol_data
  // (same finding already documented in apps/web's route).
  order_data: Record<string, unknown>;
}

interface GrailsResult {
  name: string;
  token_id: string;
  listings: GrailsListingItem[];
}

interface GrailsSearchResponse {
  success: boolean;
  data: {
    results: GrailsResult[];
    pagination: { page: number; hasNext: boolean; total: number; totalPages: number };
  };
}

/// Ported verbatim from apps/web/app/api/ensv1/grails-listings/route.ts's isFulfillable —
/// deliberately identical logic, not reimplemented, so the two paths can't silently drift
/// on what counts as a real, fulfillable listing during the migration.
function isFulfillable(orderData: Record<string, unknown>): orderData is {
  protocol_data: { signature: string; parameters: Record<string, unknown> };
} {
  const protocolData = orderData.protocol_data as { signature?: unknown; parameters?: { offer?: unknown } } | undefined;
  return typeof protocolData?.signature === "string" && Array.isArray(protocolData.parameters?.offer);
}

export interface ScrapeSummary {
  scraped: number;
  upserted: number;
  skippedNotFulfillable: number;
  pages: number;
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<ScrapeSummary> {
    let page = 1;
    // Assigned on the first loop iteration (a do-while body always runs at least once)
    // before its first read at the loop's own condition — no meaningful initial value.
    let totalPages: number;
    let scraped = 0;
    let upserted = 0;
    let skippedNotFulfillable = 0;

    do {
      const url = new URL(GRAILS_SEARCH_URL);
      url.searchParams.set("filters[showListings]", "true");
      url.searchParams.set("filters[marketplace]", "grails");
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("sortBy", "listing_date");
      url.searchParams.set("sortOrder", "desc");

      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`Grails request failed: ${res.status} (page ${page})`);
      const json = (await res.json()) as GrailsSearchResponse;
      totalPages = json.data.pagination.totalPages;

      for (const result of json.data.results) {
        scraped++;
        const active = result.listings.find((l) => l.status === "active");
        if (!active || !isFulfillable(active.order_data)) {
          skippedNotFulfillable++;
          continue;
        }
        const { signature, parameters } = active.order_data.protocol_data;

        await this.prisma.grailsListing.upsert({
          where: { orderHash: active.order_hash },
          create: {
            orderHash: active.order_hash,
            name: result.name,
            nameLength: result.name.replace(/\.eth$/i, "").length,
            tokenId: result.token_id,
            priceWei: new Prisma.Decimal(active.price),
            priceCurrency: active.currency_address,
            protocolAddress: "", // Grails doesn't surface this per-listing — filled in at read time (see GrailsService)
            protocolData: { parameters, signature } as Prisma.InputJsonValue,
            sellerAddress: active.seller_address,
            status: active.status,
          },
          update: {
            priceWei: new Prisma.Decimal(active.price),
            priceCurrency: active.currency_address,
            protocolData: { parameters, signature } as Prisma.InputJsonValue,
            status: active.status,
          },
        });
        upserted++;
      }

      this.logger.log(`page ${page}/${totalPages}: ${json.data.results.length} results, ${upserted} upserted so far`);
      page++;
    } while (page <= totalPages);

    const summary: ScrapeSummary = { scraped, upserted, skippedNotFulfillable, pages: totalPages };
    this.logger.log(`done: ${JSON.stringify(summary)}`);
    return summary;
  }
}
