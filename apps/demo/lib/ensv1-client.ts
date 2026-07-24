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

export interface GrailsListingsResult {
  listings: EnsV1Listing[];
  isLoading: boolean;
  isError: boolean;
  unresolvedCount: number;
  refetch: () => void;
}

/// Real active Grails-native listings (api.grails.app, no API key required for reads —
/// see app/api/ensv1/grails-listings) — a second, complementary Explore-grid source
/// alongside OpenSea's, not a replacement for it.
export function useGrailsListings(): GrailsListingsResult {
  const [listings, setListings] = useState<EnsV1Listing[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch("/api/ensv1/grails-listings");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setListings(json.listings ?? []);
      setUnresolvedCount(json.unresolvedCount ?? 0);
    } catch (err) {
      console.error("useGrailsListings: failed to fetch listings", err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { listings, isLoading, isError, unresolvedCount, refetch: refresh };
}

export interface EnsV1ListingForNameResult {
  listing: EnsV1Listing | null;
  isLoading: boolean;
  isError: boolean;
  notConfigured: boolean;
}

/// Looks for a specific name's active listing across both sources — used on the ENSv1
/// detail page when reached via search (as opposed to clicking a row that already
/// carries its listing data from the Explore grid). Grails is checked via a cheap exact
/// query; OpenSea has no per-token filter so it walks a bounded number of pages server-
/// side (see app/api/ensv1/listings). If a name happens to be listed on both, Grails wins
/// — simplification for a PoC rather than showing two simultaneous "buy" options for the
/// same name; a name not found on either may still be listed beyond OpenSea's bound.
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

    Promise.allSettled([
      fetch(`/api/ensv1/grails-listings?name=${encodeURIComponent(name)}`).then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      }),
      fetch(`/api/ensv1/listings?name=${encodeURIComponent(name)}`).then(async (res) => {
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
