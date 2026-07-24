import { NextRequest, NextResponse } from "next/server";
import { SEAPORT_CONTRACT_ADDRESS, currencySymbolFor, type EnsV1Listing } from "@/lib/ensv1";

/// Grails' own public search API (api.grails.app/api/v1/search) — no API key required
/// for reads (confirmed live and documented at docs.grails.app/docs/api/search; auth
/// there is SIWE+JWT, but only for write actions like posting a listing, not for browsing
/// public data). filters[marketplace]=grails restricts to listings native to Grails' own
/// Seaport conduit, so this never overlaps with our separate OpenSea-sourced fetch
/// (app/api/ensv1/listings) — the two are complementary, not duplicates of each other.
const GRAILS_SEARCH_URL = "https://api.grails.app/api/v1/search";

interface GrailsListingItem {
  price: string;
  currency_address: string;
  status: string;
  order_hash: string;
  // Despite filters[marketplace]=grails, not every returned listing's order_data has the
  // raw fulfillable Seaport shape ({parameters, signature}) — some come back as an
  // OpenSea-style display summary instead ({item, maker, ...}) with neither field. Typed
  // loosely here and validated at runtime (isFulfillable below) rather than trusted,
  // since treating the summary shape as fulfillable crashes on `.parameters.offerer`.
  order_data: Record<string, unknown>;
}

interface GrailsResult {
  name: string;
  listings: GrailsListingItem[];
}

interface GrailsSearchResponse {
  success: boolean;
  data: {
    results: GrailsResult[];
    pagination: { page: number; hasNext: boolean };
  };
}

function isFulfillable(orderData: Record<string, unknown>): orderData is {
  signature: string;
  parameters: { offer: { token: string; identifierOrCriteria: string; itemType: number }[]; [key: string]: unknown };
} {
  const parameters = orderData.parameters as { offer?: unknown } | undefined;
  return typeof orderData.signature === "string" && Array.isArray(parameters?.offer);
}

function toEnsV1Listing(result: GrailsResult): EnsV1Listing | null {
  const active = result.listings.find((l) => l.status === "active");
  if (!active || !isFulfillable(active.order_data)) return null;
  return {
    name: result.name,
    price: { value: active.price, decimals: 18, currency: currencySymbolFor(active.currency_address) },
    listing: {
      order_hash: active.order_hash,
      protocol_address: SEAPORT_CONTRACT_ADDRESS,
      protocol_data: { parameters: active.order_data.parameters, signature: active.order_data.signature },
      price: { current: { value: active.price, decimals: 18, currency: currencySymbolFor(active.currency_address) } },
    },
    source: "grails",
  };
}

/// GET /api/ensv1/grails-listings?page=1          — one page of the browsable Explore feed
/// GET /api/ensv1/grails-listings?name=alice.eth   — exact-name lookup (Grails' q= param
///   does fuzzy/substring matching, so results are filtered here to an exact, case-
///   insensitive name match rather than trusting the API's own ranking).
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");

  const url = new URL(GRAILS_SEARCH_URL);
  url.searchParams.set("filters[showListings]", "true");
  url.searchParams.set("filters[marketplace]", "grails");

  if (name) {
    url.searchParams.set("q", name);
    url.searchParams.set("limit", "10");
  } else {
    const page = req.nextUrl.searchParams.get("page") ?? "1";
    url.searchParams.set("page", page);
    url.searchParams.set("limit", "50");
    url.searchParams.set("sortBy", "listing_date");
    url.searchParams.set("sortOrder", "desc");
  }

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Grails request failed: ${res.status}`);
    const json: GrailsSearchResponse = await res.json();

    if (name) {
      const match = json.data.results.find((r) => r.name.toLowerCase() === name.toLowerCase());
      const listing = match ? toEnsV1Listing(match) : null;
      return NextResponse.json({ listing });
    }

    const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const mapped = json.data.results.map(toEnsV1Listing);
    const listings = mapped.filter((l): l is EnsV1Listing => l !== null);
    const unresolvedCount = mapped.length - listings.length;
    return NextResponse.json({ listings, unresolvedCount, next: json.data.pagination.hasNext ? page + 1 : null });
  } catch (err) {
    console.error("GET /api/ensv1/grails-listings failed:", err);
    return NextResponse.json({ error: "Grails request failed" }, { status: 502 });
  }
}
