import { NextRequest, NextResponse } from "next/server";
import {
  BASE_REGISTRAR_ADDRESS,
  NAME_WRAPPER_ADDRESS,
  batchResolveNames,
  tokenIdToHex,
  type EnsV1Listing,
  type OpenSeaListing,
} from "@/lib/ensv1";

const OPENSEA_COLLECTION_SLUG = "ens";
// Bound on how many pages the ?name= search mode will walk looking for one specific
// listing, so a name that isn't currently listed doesn't turn into an unbounded scan of
// OpenSea's whole "ens" collection (many thousands of listings).
const MAX_SEARCH_PAGES = 10;

async function fetchOpenSeaPage(apiKey: string, cursor: string | null): Promise<{ listings: OpenSeaListing[]; next: string | null }> {
  const url = new URL(`https://api.opensea.io/api/v2/listings/collection/${OPENSEA_COLLECTION_SLUG}/all`);
  url.searchParams.set("limit", "50");
  if (cursor) url.searchParams.set("next", cursor);
  const res = await fetch(url, { headers: { accept: "application/json", "x-api-key": apiKey } });
  if (!res.ok) throw new Error(`OpenSea request failed: ${res.status}`);
  const json = await res.json();
  return { listings: json.listings ?? [], next: json.next ?? null };
}

/// Classifies each listing's NFT offer item by which real ENS contract minted it, and
/// resolves the actual dotted name for each via the subgraph. Listings whose token isn't
/// a recognized ENS contract, or whose id the subgraph doesn't recognize, are dropped.
async function resolveListingNames(listings: OpenSeaListing[]): Promise<{ resolved: EnsV1Listing[]; unresolvedCount: number }> {
  const wrapperHexIds: string[] = [];
  const registrarHexIds: string[] = [];
  const wrapperIdByListing = new Map<OpenSeaListing, string>();
  const registrarIdByListing = new Map<OpenSeaListing, string>();

  for (const listing of listings) {
    const nftOffer = listing.protocol_data.parameters.offer[0];
    if (!nftOffer) continue;
    const token = nftOffer.token.toLowerCase();
    const hexId = tokenIdToHex(nftOffer.identifierOrCriteria);
    if (token === NAME_WRAPPER_ADDRESS.toLowerCase()) {
      wrapperHexIds.push(hexId);
      wrapperIdByListing.set(listing, hexId);
    } else if (token === BASE_REGISTRAR_ADDRESS.toLowerCase()) {
      registrarHexIds.push(hexId);
      registrarIdByListing.set(listing, hexId);
    }
    // Any other contract isn't a recognized ENS name token — silently excluded below by
    // having no entry in either map, not by an explicit branch, since the "ens" collection
    // shouldn't contain anything else in practice.
  }

  let namesById: Map<string, string>;
  try {
    namesById = await batchResolveNames(wrapperHexIds, registrarHexIds);
  } catch (err) {
    console.error("resolveListingNames: subgraph name resolution failed", err);
    namesById = new Map();
  }

  const resolved: EnsV1Listing[] = [];
  let unresolvedCount = 0;
  for (const listing of listings) {
    const hexId = wrapperIdByListing.get(listing) ?? registrarIdByListing.get(listing);
    const name = hexId ? namesById.get(hexId) : undefined;
    if (!name) {
      unresolvedCount++;
      continue;
    }
    resolved.push({ name, price: listing.price.current, listing, source: "opensea" });
  }
  return { resolved, unresolvedCount };
}

/// Server-side proxy to OpenSea's real active listings for the ENS collection — keeps
/// OPENSEA_API_KEY out of the browser. Two modes:
///   - GET /api/ensv1/listings?cursor=...        — one page of the browsable Explore feed
///   - GET /api/ensv1/listings?name=alice.eth     — look for one specific name's active
///     listing (reached via search rather than browsing), walking up to MAX_SEARCH_PAGES
///     of the same feed since OpenSea's collection-listings API has no per-token filter.
export async function GET(req: NextRequest) {
  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenSea API key not configured — set OPENSEA_API_KEY in .env.local" }, { status: 501 });
  }

  const name = req.nextUrl.searchParams.get("name");

  try {
    if (name) {
      let cursor: string | null = null;
      for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
        const pageResult: { listings: OpenSeaListing[]; next: string | null } = await fetchOpenSeaPage(apiKey, cursor);
        const { resolved } = await resolveListingNames(pageResult.listings);
        const match = resolved.find((l) => l.name.toLowerCase() === name.toLowerCase());
        if (match) return NextResponse.json({ listing: match, pagesChecked: page + 1 });
        if (!pageResult.next) break;
        cursor = pageResult.next;
      }
      return NextResponse.json({ listing: null, pagesChecked: MAX_SEARCH_PAGES });
    }

    const cursor = req.nextUrl.searchParams.get("cursor");
    const { listings, next } = await fetchOpenSeaPage(apiKey, cursor);
    const { resolved, unresolvedCount } = await resolveListingNames(listings);
    return NextResponse.json({ listings: resolved, unresolvedCount, next });
  } catch (err) {
    console.error("GET /api/ensv1/listings failed:", err);
    return NextResponse.json({ error: "OpenSea request failed" }, { status: 502 });
  }
}
