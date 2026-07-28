import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";
import { SEAPORT_CONTRACT_ADDRESS, currencySymbolFor, type EnsV1Listing } from "@/lib/ensv1";

/// Grails' own public search API (api.grails.app/api/v1/search) — no API key required
/// for reads (confirmed live and documented at docs.grails.app/docs/api/search; auth
/// there is SIWE+JWT, but only for write actions like posting a listing, not for browsing
/// public data). filters[marketplace]=grails is meant to restrict to listings native to
/// Grails' own Seaport conduit, but in practice also includes OpenSea orders Grails has
/// display-mirrored into their own index — those come back with a different top-level
/// order_data shape ({item, maker, protocol_data, ...} rather than Grails-native's
/// {orderHash, parameters, signature, protocol_data, ...}). Both shapes carry the real,
/// fulfillable Seaport order at order_data.protocol_data.{signature,parameters} though
/// (verified against live API responses — every currently-active listing has it there),
/// so isFulfillable checks that nested path rather than the top level, which is only
/// populated for the Grails-native shape and silently dropped ~70% of real active
/// listings when checked directly.
const GRAILS_SEARCH_URL = "https://api.grails.app/api/v1/search";

interface GrailsListingItem {
  price: string;
  currency_address: string;
  status: string;
  order_hash: string;
  // Loosely typed and validated at runtime (isFulfillable below) rather than trusted,
  // since the two shapes described above disagree on everything except protocol_data.
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
    pagination: { page: number; hasNext: boolean; total: number; totalPages: number };
  };
}

function isFulfillable(orderData: Record<string, unknown>): orderData is {
  protocol_data: {
    signature: string;
    parameters: { offer: { token: string; identifierOrCriteria: string; itemType: number }[]; [key: string]: unknown };
  };
} {
  const protocolData = orderData.protocol_data as { signature?: unknown; parameters?: { offer?: unknown } } | undefined;
  return typeof protocolData?.signature === "string" && Array.isArray(protocolData.parameters?.offer);
}

function toEnsV1Listing(result: GrailsResult): EnsV1Listing | null {
  const active = result.listings.find((l) => l.status === "active");
  if (!active) return null;
  if (!isFulfillable(active.order_data)) return null;

  const { signature, parameters } = active.order_data.protocol_data;
  return {
    name: result.name,
    price: { value: active.price, decimals: 18, currency: currencySymbolFor(active.currency_address) },
    listing: {
      order_hash: active.order_hash,
      protocol_address: SEAPORT_CONTRACT_ADDRESS,
      protocol_data: { parameters, signature },
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

  // Real server-side filters against Grails' actual schema (services/api/src/routes/
  // search.ts) — minPrice/maxPrice are wei strings there, so ETH input from the client
  // is converted; invalid/unparsable values are silently skipped rather than sent
  // through and left for Grails to reject.
  const minPriceEth = req.nextUrl.searchParams.get("minPrice");
  const maxPriceEth = req.nextUrl.searchParams.get("maxPrice");
  try {
    if (minPriceEth) url.searchParams.set("filters[minPrice]", parseEther(minPriceEth).toString());
  } catch {
    /* invalid input, omit the filter */
  }
  try {
    if (maxPriceEth) url.searchParams.set("filters[maxPrice]", parseEther(maxPriceEth).toString());
  } catch {
    /* invalid input, omit the filter */
  }
  const minLength = req.nextUrl.searchParams.get("minLength");
  const maxLength = req.nextUrl.searchParams.get("maxLength");
  if (minLength) url.searchParams.set("filters[minLength]", minLength);
  if (maxLength) url.searchParams.set("filters[maxLength]", maxLength);
  const startsWith = req.nextUrl.searchParams.get("startsWith");
  const endsWith = req.nextUrl.searchParams.get("endsWith");
  if (startsWith) url.searchParams.set("filters[startsWith]", startsWith);
  if (endsWith) url.searchParams.set("filters[endsWith]", endsWith);

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
    const mapped = json.data.results.map((r) => toEnsV1Listing(r));
    const listings = mapped.filter((l): l is EnsV1Listing => l !== null);
    const unresolvedCount = mapped.length - listings.length;
    return NextResponse.json({
      listings,
      unresolvedCount,
      next: json.data.pagination.hasNext ? page + 1 : null,
      // Grails' own real total across all its pages (currently ~9,981 at 50/page,
      // ~200 pages) — surfaced so the UI can show "page N of ~200" instead of leaving
      // the per-page resolved count looking like the entire dataset available.
      total: json.data.pagination.total,
      totalPages: json.data.pagination.totalPages,
    });
  } catch (err) {
    console.error("GET /api/ensv1/grails-listings failed:", err);
    return NextResponse.json({ error: "Grails request failed" }, { status: 502 });
  }
}
