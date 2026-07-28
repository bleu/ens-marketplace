"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnsV1Domain, EnsV1Listing } from "./ensv1";

/// Client-side data hooks for real mainnet ENS data — these call our own server-side
/// proxy routes (app/api/ensv1/*), never the ENS subgraph or OpenSea directly, so the
/// THEGRAPH_API_KEY/OPENSEA_API_KEY server-only env vars never reach the browser.

export interface EnsV1ListingsResult {
  listings: EnsV1Listing[];
  isLoading: boolean;
  isError: boolean;
  notConfigured: boolean;
  unresolvedCount: number;
  hasNext: boolean;
  refetch: () => void;
}

/// Real active OpenSea listings for the ENS collection — this doubles as the ENSv1
/// Explore-grid data source (see app/api/ensv1/listings): real listings are the
/// browsable set, no curated/hardcoded name list needed.
///
/// OpenSea's pagination is cursor-based (opaque token, forward-only), not page-number
/// based, so `page` here is a UI-facing concept only — the hook privately remembers
/// which cursor produced each page number as the user navigates forward, and looks it
/// up again on Previous rather than needing the caller to track cursors. This only
/// supports moving one page at a time (no jumping straight to an arbitrary page), which
/// is fine since the UI only exposes Next/Previous.
export function useEnsV1Listings(page: number): EnsV1ListingsResult {
  const [listings, setListings] = useState<EnsV1Listing[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const cursorForPageRef = useRef<Record<number, string | null>>({ 1: null });

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    setNotConfigured(false);
    try {
      const cursor = cursorForPageRef.current[page] ?? null;
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/ensv1/listings?${params.toString()}`);
      if (res.status === 501) {
        setNotConfigured(true);
        setListings([]);
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setListings(json.listings ?? []);
      setUnresolvedCount(json.unresolvedCount ?? 0);
      cursorForPageRef.current[page + 1] = json.next ?? null;
      setHasNext(!!json.next);
    } catch (err) {
      console.error("useEnsV1Listings: failed to fetch listings", err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { listings, isLoading, isError, notConfigured, unresolvedCount, hasNext, refetch: refresh };
}

export interface GrailsListingsResult {
  listings: EnsV1Listing[];
  isLoading: boolean;
  isError: boolean;
  unresolvedCount: number;
  hasNext: boolean;
  refetch: () => void;
}

export interface GrailsFilters {
  minPrice?: string;
  maxPrice?: string;
  minLength?: string;
  maxLength?: string;
  startsWith?: string;
  endsWith?: string;
}

/// Real active Grails-native listings (api.grails.app, no API key required for reads —
/// see app/api/ensv1/grails-listings) — a second, complementary Explore-grid source
/// alongside OpenSea's, not a replacement for it. Filters are applied server-side
/// against Grails' real filter schema (unlike OpenSea, which has no filter params at
/// all — see the Explore page for how OpenSea-sourced rows are filtered client-side
/// on whatever's already loaded instead). Grails' pagination is plain page numbers, so
/// unlike OpenSea's cursor-based hook, `page` is passed straight through as a query param.
export function useGrailsListings(filters: GrailsFilters = {}, page = 1): GrailsListingsResult {
  const [listings, setListings] = useState<EnsV1Listing[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const { minPrice, maxPrice, minLength, maxLength, startsWith, endsWith } = filters;

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const params = new URLSearchParams();
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (minLength) params.set("minLength", minLength);
      if (maxLength) params.set("maxLength", maxLength);
      if (startsWith) params.set("startsWith", startsWith);
      if (endsWith) params.set("endsWith", endsWith);
      params.set("page", String(page));
      const res = await fetch(`/api/ensv1/grails-listings?${params.toString()}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setListings(json.listings ?? []);
      setUnresolvedCount(json.unresolvedCount ?? 0);
      setHasNext(!!json.next);
    } catch (err) {
      console.error("useGrailsListings: failed to fetch listings", err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [minPrice, maxPrice, minLength, maxLength, startsWith, endsWith, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { listings, isLoading, isError, unresolvedCount, hasNext, refetch: refresh };
}

const SESSION_CACHE_PREFIX = "ensv1-listing:";

/// Called when a row in the Explore grid is clicked, before navigating to its detail
/// page — stashes the listing data the grid already fetched so the detail page can use
/// it directly instead of re-deriving "is this listed" from scratch. This matters
/// specifically for OpenSea: its curated per-NFT /best endpoint (used by the fresh
/// lookup below) can be more conservative than the raw browse feed the grid uses, so a
/// listing visibly shown as a row could otherwise report "not currently listed" when
/// clicked into. Passing the grid's own data through keeps the two views consistent —
/// if it's real enough to show in the grid, it's real enough to attempt to buy.
export function cacheListingForNavigation(listing: EnsV1Listing) {
  try {
    sessionStorage.setItem(SESSION_CACHE_PREFIX + listing.name.toLowerCase(), JSON.stringify(listing));
  } catch {
    // sessionStorage unavailable (private browsing quota, etc.) — falls back to the
    // detail page's normal fresh lookup, which still works, just via the curated check.
  }
}

/// Non-destructive read (no removeItem) — React 18 Strict Mode double-invokes effects
/// in dev, so a "read and clear" here would consume the cache entry on the throwaway
/// first invocation and find nothing on the real one. A lingering entry is harmless: at
/// worst it's silently overwritten next time this name is clicked from the grid again,
/// or it just expires with the tab/session.
function peekCachedListing(name: string): EnsV1Listing | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + name.toLowerCase());
    return raw ? (JSON.parse(raw) as EnsV1Listing) : null;
  } catch {
    return null;
  }
}

export interface EnsV1ListingForNameResult {
  listing: EnsV1Listing | null;
  isLoading: boolean;
  isError: boolean;
  notConfigured: boolean;
}

/// Looks for a specific name's active listing across both sources — used on the ENSv1
/// detail page. If reached by clicking a row in the Explore grid, the grid's own
/// already-fetched OpenSea listing data (see cacheListingForNavigation) is used directly
/// instead of a fresh lookup, so the detail page never disagrees with what the grid just
/// showed. Otherwise (e.g. reached via search), both sources are checked fresh: Grails'
/// exact q= query, and OpenSea's per-NFT /best endpoint. If a name happens to be listed
/// on both, Grails wins — simplification for a PoC rather than showing two simultaneous
/// "buy" options for the same name.
export function useEnsV1ListingForName(name: string | null): EnsV1ListingForNameResult {
  const [listing, setListing] = useState<EnsV1Listing | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    if (!name) {
      setListing(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);
    setNotConfigured(false);

    const cachedOpensea = peekCachedListing(name);

    Promise.allSettled([
      fetch(`/api/ensv1/grails-listings?name=${encodeURIComponent(name)}`).then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      }),
      cachedOpensea
        ? Promise.resolve({ listing: cachedOpensea })
        : fetch(`/api/ensv1/listings?name=${encodeURIComponent(name)}`).then(async (res) => {
            if (res.status === 501) return { notConfigured: true };
            if (!res.ok) throw new Error(`status ${res.status}`);
            return res.json();
          }),
    ])
      .then(([grailsResult, openseaResult]) => {
        if (cancelled) return;
        const grails = grailsResult.status === "fulfilled" ? grailsResult.value.listing : null;
        const opensea = openseaResult.status === "fulfilled" ? openseaResult.value : null;
        if (grails) {
          setListing(grails);
        } else if (opensea?.notConfigured) {
          setNotConfigured(true);
        } else if (opensea?.listing) {
          setListing(opensea.listing);
        } else {
          setListing(null);
        }
        // Only surface an error if BOTH sources failed — one working source is enough
        // to answer "is this listed," so a single transient failure shouldn't block it.
        if (grailsResult.status === "rejected" && openseaResult.status === "rejected") {
          console.error("useEnsV1ListingForName: both lookups failed", grailsResult.reason, openseaResult.reason);
          setIsError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [name]);

  return { listing, isLoading, isError, notConfigured };
}

export interface EnsV1DomainResult {
  domain: EnsV1Domain | null;
  isLoading: boolean;
  isError: boolean;
  notFound: boolean;
  refetch: () => void;
}

/// Real owner/resolver/expiry for a single mainnet name, via the ENS subgraph proxy.
/// Pass null to skip the lookup (e.g. while a name hasn't been typed/resolved yet). The
/// server already retries transient 429s from the free/shared subgraph endpoint (see
/// lib/ensv1.ts querySubgraph), but exposes `refetch` too in case a request fails for
/// some other transient reason (dropped connection, etc.).
export function useEnsV1Domain(name: string | null): EnsV1DomainResult {
  const [domain, setDomain] = useState<EnsV1Domain | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!name) {
      setDomain(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);
    setNotFound(false);
    fetch(`/api/ensv1/search?name=${encodeURIComponent(name)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        setDomain(json.domain);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("useEnsV1Domain: lookup failed", err);
        setIsError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, retryCount]);

  return { domain, isLoading, isError, notFound, refetch: () => setRetryCount((c) => c + 1) };
}
