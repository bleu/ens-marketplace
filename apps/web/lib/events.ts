"use client";

import { useCallback, useEffect, useState } from "react";
import type { Abi, ContractEventName, GetContractEventsParameters, GetContractEventsReturnType } from "viem";
import { usePublicClient } from "wagmi";

type PublicClient = NonNullable<ReturnType<typeof usePublicClient>>;

/// Real ENSv2 marketplace data — these call our own server-side proxy routes
/// (app/api/domains/*, app/api/subnames/*), which forward to apps/api's DomainsModule/
/// SubnamesModule, which query the Envio HyperIndex indexer (apps/indexer) instead of
/// this app scanning eth_getLogs directly. See docs/roadmap.md / the ENSv2-indexer plan
/// for why: unbounded historical scans + a full-dataset multicall on a 3s poll doesn't
/// scale to thousands of listed domains.

/// Public RPCs commonly cap `eth_getLogs`' block range — the default Sepolia RPC
/// (thirdweb, wagmi.ts's fallback transport) rejects anything over 1000 blocks per
/// request ("Log response size exceeded... Maximum allowed number of requested blocks is
/// 1000", confirmed live while scanning the real ENSv2 alpha registry — see
/// lib/ensv2-alpha.ts). Scanning in windows under that cap, starting at `fromBlock` (the
/// network's actual deploy block — see lib/contracts.ts's `fromBlock`, threaded in via
/// `useContractAddresses()`) rather than block 0, is what makes event scanning work at all
/// against a real chain's block height.
///
/// Still used by lib/ensv2-alpha.ts (the real ENSv2 Sepolia alpha registry — a separate
/// concern from this file's indexed mock-marketplace hooks below, with no indexer of its
/// own yet).
const MAX_BLOCK_RANGE = 900n;

export async function getContractEventsChunked<const abi extends Abi | readonly unknown[], eventName extends ContractEventName<abi>>(
  client: PublicClient,
  params: GetContractEventsParameters<abi, eventName> & { fromBlock: bigint },
): Promise<GetContractEventsReturnType<abi, eventName>> {
  const latest = await client.getBlockNumber();
  if (params.fromBlock > latest) return [] as GetContractEventsReturnType<abi, eventName>;

  const windows: Array<[bigint, bigint]> = [];
  for (let start = params.fromBlock; start <= latest; start += MAX_BLOCK_RANGE) {
    const end = start + MAX_BLOCK_RANGE - 1n > latest ? latest : start + MAX_BLOCK_RANGE - 1n;
    windows.push([start, end]);
  }

  const results = await Promise.all(
    windows.map(([fromBlock, toBlock]) => client.getContractEvents({ ...params, fromBlock, toBlock })),
  );
  return results.flat() as GetContractEventsReturnType<abi, eventName>;
}

export interface DomainOrderRow {
  seller: `0x${string}`;
  price: bigint;
  pinnedHash: `0x${string}`;
  // Matches CanonicalIdOrderManager.sol's Status enum (see lib/contracts.ts's OrderStatus).
  status: number;
}

export interface DomainSearchRow {
  canonicalId: bigint;
  order: DomainOrderRow;
  name: string | null;
}

export interface DomainSearchResult {
  rows: DomainSearchRow[];
  total: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/// Replaces useKnownDomainIds + the per-visit orders()/nameOf() multicall — order and
/// name now come back already paginated and joined from the indexer, so the frontend
/// never needs to hold "every domain ever listed" in memory at once.
export function useDomainSearch(tab: "names" | "listings", page: number): DomainSearchResult {
  const [rows, setRows] = useState<DomainSearchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch(`/api/domains/search?tab=${tab}&page=${page}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setRows(
        (json.rows ?? []).map((r: { canonicalId: string; order: { seller: string; price: string; pinnedHash: string; status: number }; name: string | null }) => ({
          canonicalId: BigInt(r.canonicalId),
          order: {
            seller: r.order.seller as `0x${string}`,
            price: BigInt(r.order.price),
            pinnedHash: r.order.pinnedHash as `0x${string}`,
            status: r.order.status,
          },
          name: r.name,
        })),
      );
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
    } catch (err) {
      console.error("useDomainSearch: failed to fetch", err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, total, totalPages, isLoading, isError, refetch: refresh };
}

export interface SubnameListingRow {
  parentAddress: `0x${string}`;
  pricePerTerm: bigint;
  termSeconds: bigint;
  active: boolean;
}

export interface SubnameSearchRow {
  canonicalId: bigint;
  listing: SubnameListingRow;
  tenant: `0x${string}` | null;
  leaseActiveUntil: bigint | null;
  name: string | null;
}

export interface SubnameSearchResult {
  rows: SubnameSearchRow[];
  total: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/// Replaces useKnownSubnameIds + the per-visit listings()/leaseActiveUntil()/tenantOf()/
/// nameOf() multicall — same paginated, pre-joined treatment as useDomainSearch.
export function useSubnameSearch(page: number): SubnameSearchResult {
  const [rows, setRows] = useState<SubnameSearchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const res = await fetch(`/api/subnames/search?page=${page}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setRows(
        (json.rows ?? []).map(
          (r: {
            canonicalId: string;
            listing: { parentAddress: string; pricePerTerm: string; termSeconds: string; active: boolean };
            tenant: string | null;
            leaseActiveUntil: string | null;
            name: string | null;
          }) => ({
            canonicalId: BigInt(r.canonicalId),
            listing: {
              parentAddress: r.listing.parentAddress as `0x${string}`,
              pricePerTerm: BigInt(r.listing.pricePerTerm),
              termSeconds: BigInt(r.listing.termSeconds),
              active: r.listing.active,
            },
            tenant: r.tenant as `0x${string}` | null,
            leaseActiveUntil: r.leaseActiveUntil !== null ? BigInt(r.leaseActiveUntil) : null,
            name: r.name,
          }),
        ),
      );
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
    } catch (err) {
      console.error("useSubnameSearch: failed to fetch", err);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, total, totalPages, isLoading, isError, refetch: refresh };
}

export interface LastSale {
  price: bigint;
  at: number;
}

/// Real "last sale" for a name, from the indexer's DomainActivity — no fake numbers, and
/// no sale shown at all if the name has never actually changed hands.
export function useLastSale(canonicalId: bigint): LastSale | null {
  const [sale, setSale] = useState<LastSale | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/domains/${canonicalId}/last-sale`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setSale(json.sale ? { price: BigInt(json.sale.price), at: json.sale.at } : null);
    } catch (err) {
      console.error("useLastSale: failed to fetch", err);
    }
  }, [canonicalId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return sale;
}

export interface ActivityItem {
  event: string;
  color: string;
  detail: string;
  at: number;
  txHash: string;
}

/// Real per-name activity feed from the indexer's DomainActivity — display formatting
/// (color/detail) happens server-side (apps/api's activity-format.ts), same rules this
/// hook used to apply itself when it scanned events client-side.
export function useNameActivity(canonicalId: bigint): ActivityItem[] {
  const [items, setItems] = useState<ActivityItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/domains/${canonicalId}/activity`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setItems(json.items ?? []);
    } catch (err) {
      console.error("useNameActivity: failed to fetch", err);
    }
  }, [canonicalId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return items;
}

/// Real subname count for a parent name, from the registry's SubnameRegistered history —
/// feeds the domain detail page's "N subnames" box.
export function useSubnameCount(parentId: bigint): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/subnames/count?parentId=${parentId}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setCount(json.count ?? 0);
    } catch (err) {
      console.error("useSubnameCount: failed to fetch", err);
    }
  }, [parentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return count;
}

export interface OwnedName {
  canonicalId: bigint;
  name: string;
}

/// Real "names in your wallet" for the list-a-domain picker — the indexer's IndexedName
/// already tracks current owner directly, so this is a straight current-state lookup
/// rather than a client-side reduction of Registered+OwnerChanged history.
export function useOwnedNames(owner: `0x${string}` | undefined): OwnedName[] {
  const [names, setNames] = useState<OwnedName[]>([]);

  const refresh = useCallback(async () => {
    if (!owner) {
      setNames([]);
      return;
    }
    try {
      const res = await fetch(`/api/domains/owned?address=${owner}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setNames((json.names ?? []).map((n: { canonicalId: string; name: string }) => ({ canonicalId: BigInt(n.canonicalId), name: n.name })));
    } catch (err) {
      console.error("useOwnedNames: failed to fetch", err);
    }
  }, [owner]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return names;
}
