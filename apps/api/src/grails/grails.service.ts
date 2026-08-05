import { Injectable } from "@nestjs/common";
import { parseEther } from "viem";
import { PrismaService } from "../prisma/prisma.service";
import { currencySymbolFor, SEAPORT_CONTRACT_ADDRESS, type EnsV1Listing } from "./ensv1-types";
import type { GrailsListing, Prisma } from "@prisma/client";

export interface SearchFilters {
  minPriceEth?: string;
  maxPriceEth?: string;
  minLength?: number;
  maxLength?: number;
  startsWith?: string;
  endsWith?: string;
}

export interface SearchResult {
  listings: EnsV1Listing[];
  unresolvedCount: number;
  next: number | null;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 50;

function toEnsV1Listing(row: GrailsListing): EnsV1Listing {
  // .toFixed(0), not .toString() — guarantees a plain integer digit string regardless of
  // Decimal.js's exponential-notation thresholds, which matters for genuinely large wei
  // amounts (real listings have already been seen well above what a bigint could hold).
  const priceValue = row.priceWei.toFixed(0);
  const currency = currencySymbolFor(row.priceCurrency);
  const protocolData = row.protocolData as { parameters: EnsV1Listing["listing"]["protocol_data"]["parameters"]; signature: string };
  return {
    name: row.name,
    price: { value: priceValue, decimals: 18, currency },
    listing: {
      order_hash: row.orderHash,
      protocol_address: row.protocolAddress || SEAPORT_CONTRACT_ADDRESS,
      protocol_data: protocolData,
      price: { current: { value: priceValue, decimals: 18, currency } },
    },
    source: "grails",
  };
}

/// Query semantics deliberately match apps/demo's current live-Grails-API route exactly
/// (same filter params, same page size, same response shape) — the whole point of this
/// service is that apps/demo's frontend code needs zero changes when its API route
/// switches from calling Grails directly to calling this service instead.
@Injectable()
export class GrailsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(filters: SearchFilters, page: number): Promise<SearchResult> {
    const where: Prisma.GrailsListingWhereInput = {};

    // Invalid/unparsable ETH values are silently dropped rather than thrown, matching
    // the current route's behavior of omitting the filter instead of erroring. Values
    // passed as strings (not bigint) — priceWei is a Decimal column (see schema.prisma
    // for why), and Prisma's DecimalFilter takes string | number | Decimal, not bigint.
    const priceRange: Prisma.DecimalFilter = {};
    if (filters.minPriceEth) {
      try {
        priceRange.gte = parseEther(filters.minPriceEth).toString();
      } catch {
        /* invalid input, omit the filter */
      }
    }
    if (filters.maxPriceEth) {
      try {
        priceRange.lte = parseEther(filters.maxPriceEth).toString();
      } catch {
        /* invalid input, omit the filter */
      }
    }
    if (Object.keys(priceRange).length > 0) where.priceWei = priceRange;

    if (filters.minLength !== undefined || filters.maxLength !== undefined) {
      where.nameLength = { gte: filters.minLength, lte: filters.maxLength };
    }
    // A single StringFilter can carry both startsWith and endsWith at once — Prisma ANDs
    // them together into one WHERE clause, same net effect as the two separate params.
    if (filters.startsWith || filters.endsWith) {
      where.name = {
        ...(filters.startsWith ? { startsWith: filters.startsWith } : {}),
        ...(filters.endsWith ? { endsWith: filters.endsWith } : {}),
        mode: "insensitive",
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.grailsListing.findMany({
        where,
        orderBy: { scrapedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.grailsListing.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return {
      listings: rows.map(toEnsV1Listing),
      // Every row is already a validated, fulfillable listing (validation happens at
      // scrape time — see ScraperService) — nothing here is ever dropped post-query.
      unresolvedCount: 0,
      next: page < totalPages ? page + 1 : null,
      total,
      totalPages,
    };
  }

  async findByName(name: string): Promise<EnsV1Listing | null> {
    const row = await this.prisma.grailsListing.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      orderBy: { scrapedAt: "desc" },
    });
    return row ? toEnsV1Listing(row) : null;
  }
}
