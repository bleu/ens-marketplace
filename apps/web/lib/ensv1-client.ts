"use client";

import { useCallback, useEffect, useState } from "react";
import type { EnsV1Domain, EnsV1Listing } from "./ensv1";

/// Client-side data hooks for real mainnet ENS data — these call our own server-side
/// proxy routes (app/api/ensv1/*), never the ENS subgraph or OpenSea directly, so the
/// THEGRAPH_API_KEY/OPENSEA_API_KEY server-only env vars never reach the browser.

/// There is no OpenSea browse hook. OpenSea's listings endpoint takes no filter params, so a
/// feed built on it could only ever filter whichever page was already in the browser — set a
/// price ceiling and you got three rows on "page 1 of many". The Explore feed is Grails-only
/// (our own Postgres, real server-side filtering), and OpenSea stays where it works: per-name
/// lookups on the detail page, via useEnsV1ListingForName below. Merging the two back
/// together needs OpenSea's listings scraped into the same database — see
/// docs/explore-filters.md.

export interface GrailsListingsResult {
  listings: EnsV1Listing[];
  isLoading: boolean;
  isError: boolean;
  unresolvedCount: number;
  hasNext: boolean;
  /** How many listings match the current filters in total, and how many pages that is — not
   * just this page. Every filter is applied server-side, so this is a real count of the
   * filtered set rather than a whole-table figure sitting next to a client-side-filtered
   * page. Null until the first successful fetch resolves. */
  total: number | null;
  totalPages: number | null;
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

/// Sidebar state to query string, kept separate from the hook so it can be tested without
/// rendering anything — it's the contract with apps/api's GrailsController, and a filter
/// dropped here fails silently rather than loudly. Empty values are omitted rather than sent
/// blank, so an untouched input can't look like an active filter server-side.
export function grailsSearchParams(filters: GrailsFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.minPrice) params.set("minPrice", filters.minPrice);
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters.minLength) params.set("minLength", filters.minLength);
  if (filters.maxLength) params.set("maxLength", filters.maxLength);
  if (filters.startsWith) params.set("startsWith", filters.startsWith);
  if (filters.endsWith) params.set("endsWith", filters.endsWith);
  params.set("page", String(page));
  return params.toString();
}

/// The Explore feed. Listings come from our own Postgres via app/api/ensv1/grails-listings
/// (scraped from Grails ahead of their API's discontinuation — see docs/grails-migration.md),
/// and every filter, the count and the pagination are applied server-side there, so what the
/// header claims and what the user can page through are the same set.
///
/// `filters` is depended on by its serialized form rather than field-by-field — the object is
/// rebuilt on every render by the caller, so a dependency on the object itself would refetch
/// forever, and listing each field individually goes stale the moment one is added.
export function useGrailsListings(filters: GrailsFilters = {}, page = 1): GrailsListingsResult {
  const [listings, setListings] = useState<EnsV1Listing[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const search = grailsSearchParams(filters, page);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch(`/api/ensv1/grails-listings?${search}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setListings(json.listings ?? []);
      setUnresolvedCount(json.unresolvedCount ?? 0);
      setHasNext(!!json.next);
      setTotal(typeof json.total === "number" ? json.total : null);
      setTotalPages(typeof json.totalPages === "number" ? json.totalPages : null);
    } catch (err) {
      console.error("useGrailsListings: failed to fetch listings", err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { listings, isLoading, isError, unresolvedCount, hasNext, total, totalPages, refetch: refresh };
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
  // Nothing to key the cache on without a resolved name — callers only reach this from a
  // row that routes to the name-keyed detail page in the first place (see EnsV1Row),
  // which name-less listings never do (see EnsV1Listing.name), but guarded here too since
  // this is a public export.
  if (listing.name === null) return;
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
/// on both, Grails wins — simplification for the beta rather than showing two simultaneous
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
