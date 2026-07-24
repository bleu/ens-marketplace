"use client";

import { useCallback, useEffect, useState } from "react";
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
  refetch: () => void;
}

/// Real active OpenSea listings for the ENS collection — this doubles as the ENSv1
/// Explore-grid data source (see app/api/ensv1/listings): real listings are the
/// browsable set, no curated/hardcoded name list needed.
export function useEnsV1Listings(): EnsV1ListingsResult {
  const [listings, setListings] = useState<EnsV1Listing[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    setNotConfigured(false);
    try {
      const res = await fetch("/api/ensv1/listings");
      if (res.status === 501) {
        setNotConfigured(true);
        setListings([]);
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setListings(json.listings ?? []);
      setUnresolvedCount(json.unresolvedCount ?? 0);
    } catch (err) {
      console.error("useEnsV1Listings: failed to fetch listings", err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { listings, isLoading, isError, notConfigured, unresolvedCount, refetch: refresh };
}

export interface EnsV1ListingForNameResult {
  listing: EnsV1Listing | null;
  isLoading: boolean;
  isError: boolean;
  notConfigured: boolean;
}

/// Looks for a specific name's active OpenSea listing — used on the ENSv1 detail page
/// when reached via search (as opposed to clicking a row already carrying its listing
/// data from the Explore grid). Walks a bounded number of pages server-side (see
/// app/api/ensv1/listings) since OpenSea's collection-listings API has no per-token
/// filter; a name that isn't found may still be listed beyond that bound.
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
    fetch(`/api/ensv1/listings?name=${encodeURIComponent(name)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 501) {
          setNotConfigured(true);
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        setListing(json.listing ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("useEnsV1ListingForName: lookup failed", err);
        setIsError(true);
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
}

/// Real owner/resolver/expiry for a single mainnet name, via the ENS subgraph proxy.
/// Pass null to skip the lookup (e.g. while a name hasn't been typed/resolved yet).
export function useEnsV1Domain(name: string | null): EnsV1DomainResult {
  const [domain, setDomain] = useState<EnsV1Domain | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [notFound, setNotFound] = useState(false);

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
  }, [name]);

  return { domain, isLoading, isError, notFound };
}
