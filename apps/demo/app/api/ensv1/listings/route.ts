import { NextRequest, NextResponse } from "next/server";
import {
  BASE_REGISTRAR_ADDRESS,
  NAME_WRAPPER_ADDRESS,
  batchResolveNames,
  candidateTokenIds,
  tokenIdToHex,
  type EnsV1Listing,
  type OpenSeaListing,
} from "@/lib/ensv1";

const OPENSEA_COLLECTION_SLUG = "ens";

/// Direct per-NFT lookup (GET /listings/collection/{slug}/nfts/{identifier}/best) —
/// used for the ?name= search mode instead of paginating the whole collection, since we
/// already know exactly which token(s) the name could be listed under (see
/// candidateTokenIds). Also authoritative in a way the bulk /all feed isn't: OpenSea's
/// own docs describe this as the listing actually usable for fulfillment, whereas /all
/// has been observed returning a listing still marked "ACTIVE" that this endpoint no
/// longer considers fulfillable (e.g. the offerer's approval/balance state changed) —
/// so this doubles as a stronger existence check, not just a faster one.
async function fetchBestListingForToken(apiKey: string, tokenIdDecimal: string): Promise<OpenSeaListing | null> {
  const res = await fetch(
    `https://api.opensea.io/api/v2/listings/collection/${OPENSEA_COLLECTION_SLUG}/nfts/${tokenIdDecimal}/best`,
    { headers: { accept: "application/json", "x-api-key": apiKey } },
  );
  if (res.status === 404) return null;
  const json = await res.json();
  if (json.errors || json.status !== "ACTIVE") return null;
  return json as OpenSeaListing;
}

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
/// OPENSEA_API_KEY out of the browser. Every listing OpenSea returns in the browse feed
/// is included as-is (no spam/price filtering — this is a PoC integration meant to show
/// exactly what each marketplace has, and anything shown is a real order a user can
/// choose to attempt on-chain). Two modes:
///   - GET /api/ensv1/listings?cursor=...        — one page of the browsable Explore feed
///   - GET /api/ensv1/listings?name=alice.eth     — direct per-token lookup for one
///     specific name's active listing (see fetchBestListingForToken) — fast and doesn't
///     depend on the ENS subgraph at all, unlike the paginated browse mode above. Note
///     this uses OpenSea's own curated /best endpoint, which can be more conservative
///     than the raw browse feed (see app/domains/ensv1/[name]/page.tsx and
///     lib/ensv1-client.ts's session-cache passthrough for how a row clicked from the
///     Explore grid bypasses this and always remains attemptable).
export async function GET(req: NextRequest) {
  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenSea API key not configured — set OPENSEA_API_KEY in .env.local" }, { status: 501 });
  }

  const name = req.nextUrl.searchParams.get("name");

  try {
    if (name) {
      const { wrapped, unwrapped } = candidateTokenIds(name);
      const [wrappedListing, unwrappedListing] = await Promise.all([
        fetchBestListingForToken(apiKey, wrapped),
        unwrapped ? fetchBestListingForToken(apiKey, unwrapped) : Promise.resolve(null),
      ]);
      const found = wrappedListing ?? unwrappedListing;
      if (!found) return NextResponse.json({ listing: null });
      return NextResponse.json({
        listing: { name, price: found.price.current, listing: found, source: "opensea" as const } satisfies EnsV1Listing,
      });
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
