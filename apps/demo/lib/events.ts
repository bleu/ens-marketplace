"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatEther,
  type Abi,
  type ContractEventName,
  type GetContractEventsParameters,
  type GetContractEventsReturnType,
  type Log,
} from "viem";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { leaseVaultAbi, orderManagerAbi, registryAbi, useContractAddresses } from "./contracts";

type PublicClient = NonNullable<ReturnType<typeof usePublicClient>>;

/// Public RPCs commonly cap `eth_getLogs`' block range — the default Sepolia RPC
/// (thirdweb, wagmi.ts's fallback transport) rejects anything over 1000 blocks per
/// request ("Log response size exceeded... Maximum allowed number of requested blocks is
/// 1000", confirmed live while scanning the real ENSv2 alpha registry — see
/// lib/ensv2-alpha.ts). Scanning in windows under that cap, starting at `fromBlock` (the
/// network's actual deploy block — see lib/contracts.ts's `fromBlock`, threaded in via
/// `useContractAddresses()`) rather than block 0, is what makes event scanning work on a
/// real chain instead of just Anvil's tiny local chain.
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

/// No indexer at PoC stage (see docs/roadmap.md) — canonicalIds are discovered directly
/// from historical + live contract events. Once an ID is known, the pages that use these
/// hooks read its *current* state fresh via multicall (`useReadContracts`), rather than
/// reconstructing state by replaying event payloads — simpler and less bug-prone for a
/// local demo than a full client-side event reducer.
export interface KnownIds {
  ids: bigint[];
  /** True when the historical event scan itself failed (RPC error, wrong chain, node
   * restart, etc.) — callers must not conflate this with "scan succeeded and found
   * nothing", which renders as a genuinely empty registry. */
  isError: boolean;
  /** Re-runs the event scan — lets callers offer a retry affordance on failure. */
  refetch: () => void;
}

export function useKnownDomainIds(): KnownIds {
  const client = usePublicClient();
  const { orderManager, fromBlock } = useContractAddresses();
  const [ids, setIds] = useState<bigint[]>([]);
  const [isError, setIsError] = useState(false);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const logs = await getContractEventsChunked(client, {
        address: orderManager,
        abi: orderManagerAbi,
        eventName: "Listed",
        fromBlock,
      });
      setIds(Array.from(new Set(logs.map((log) => log.args.canonicalId as bigint))));
      setIsError(false);
    } catch (err) {
      console.error("useKnownDomainIds: failed to scan Listed events", err);
      setIsError(true);
    }
  }, [client, orderManager, fromBlock]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({
    address: orderManager,
    abi: orderManagerAbi,
    eventName: "Listed",
    onLogs: refresh,
  });

  return { ids, isError, refetch: refresh };
}

export function useKnownSubnameIds(): KnownIds {
  const client = usePublicClient();
  const { leaseVault, fromBlock } = useContractAddresses();
  const [ids, setIds] = useState<bigint[]>([]);
  const [isError, setIsError] = useState(false);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const logs = await getContractEventsChunked(client, {
        address: leaseVault,
        abi: leaseVaultAbi,
        eventName: "Announced",
        fromBlock,
      });
      setIds(Array.from(new Set(logs.map((log) => log.args.canonicalId as bigint))));
      setIsError(false);
    } catch (err) {
      console.error("useKnownSubnameIds: failed to scan Announced events", err);
      setIsError(true);
    }
  }, [client, leaseVault, fromBlock]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({
    address: leaseVault,
    abi: leaseVaultAbi,
    eventName: "Announced",
    onLogs: refresh,
  });

  return { ids, isError, refetch: refresh };
}

export interface LastSale {
  price: bigint;
  at: number;
}

/// Real "last sale" derived from Filled/Refilled event history for a name — no fake
/// numbers, and no sale shown at all if the name has never actually changed hands.
export function useLastSale(canonicalId: bigint): LastSale | null {
  const client = usePublicClient();
  const { orderManager, fromBlock } = useContractAddresses();
  const [sale, setSale] = useState<LastSale | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const [filled, refilled] = await Promise.all([
        getContractEventsChunked(client, {
          address: orderManager,
          abi: orderManagerAbi,
          eventName: "Filled",
          args: { canonicalId },
          fromBlock,
        }),
        getContractEventsChunked(client, {
          address: orderManager,
          abi: orderManagerAbi,
          eventName: "Refilled",
          args: { canonicalId },
          fromBlock,
        }),
      ]);
      const all = [...filled, ...refilled].sort((a, b) => Number(a.blockNumber! - b.blockNumber!));
      if (all.length === 0) {
        setSale(null);
        return;
      }
      const last = all[all.length - 1];
      const block = await client.getBlock({ blockNumber: last.blockNumber! });
      setSale({ price: last.args.price as bigint, at: Number(block.timestamp) });
    } catch (err) {
      console.error("useLastSale: failed to scan Filled/Refilled events", err);
    }
  }, [client, canonicalId, orderManager, fromBlock]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({ address: orderManager, abi: orderManagerAbi, eventName: "Filled", onLogs: refresh });
  useWatchContractEvent({ address: orderManager, abi: orderManagerAbi, eventName: "Refilled", onLogs: refresh });

  return sale;
}

export interface ActivityItem {
  event: string;
  color: string;
  detail: string;
  at: number;
  txHash: string;
}

function formatActivity(log: Log & { eventName?: string; args?: Record<string, unknown> }, at: number): ActivityItem {
  const args = (log.args ?? {}) as Record<string, unknown>;
  const base = { at, txHash: log.transactionHash ?? "" };
  switch (log.eventName) {
    case "Listed":
      return { ...base, event: "Listed", color: "var(--brand)", detail: `${formatEther(args.price as bigint)} ETH` };
    case "Relisted":
      return { ...base, event: "Relisted", color: "var(--brand)", detail: `${formatEther(args.newPrice as bigint)} ETH` };
    case "Filled":
      return { ...base, event: "Sale", color: "var(--highlight)", detail: `${formatEther(args.price as bigint)} ETH` };
    case "Refilled":
      return { ...base, event: "Sale (diff accepted)", color: "var(--highlight)", detail: `${formatEther(args.price as bigint)} ETH` };
    case "OrderSuspended":
      return { ...base, event: "Suspended", color: "var(--accent)", detail: "state changed since listing" };
    case "Cancelled":
      return { ...base, event: "Cancelled", color: "var(--fg-muted)", detail: "—" };
    default:
      return { ...base, event: log.eventName ?? "Event", color: "var(--fg-muted)", detail: "—" };
  }
}

/// Real per-name activity feed built from CanonicalIdOrderManager's own event log — no
/// indexer, matching this repo's PoC scope, and no fabricated activity.
export function useNameActivity(canonicalId: bigint): ActivityItem[] {
  const client = usePublicClient();
  const { orderManager, fromBlock } = useContractAddresses();
  const [items, setItems] = useState<ActivityItem[]>([]);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const eventNames = ["Listed", "Relisted", "Filled", "OrderSuspended", "Cancelled", "Refilled"] as const;
      const logsByEvent = await Promise.all(
        eventNames.map((eventName) =>
          getContractEventsChunked(client, {
            address: orderManager,
            abi: orderManagerAbi,
            eventName,
            args: { canonicalId },
            fromBlock,
          }),
        ),
      );
      const flat = logsByEvent.flat();
      const withTimestamps = await Promise.all(
        flat.map(async (log) => {
          const block = await client.getBlock({ blockNumber: log.blockNumber! });
          return formatActivity(log, Number(block.timestamp));
        }),
      );
      withTimestamps.sort((a, b) => b.at - a.at);
      setItems(withTimestamps);
    } catch (err) {
      console.error("useNameActivity: failed to scan activity events", err);
    }
  }, [client, canonicalId, orderManager, fromBlock]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({ address: orderManager, abi: orderManagerAbi, eventName: "Listed", onLogs: refresh });
  useWatchContractEvent({ address: orderManager, abi: orderManagerAbi, eventName: "Relisted", onLogs: refresh });
  useWatchContractEvent({ address: orderManager, abi: orderManagerAbi, eventName: "Filled", onLogs: refresh });
  useWatchContractEvent({ address: orderManager, abi: orderManagerAbi, eventName: "OrderSuspended", onLogs: refresh });
  useWatchContractEvent({ address: orderManager, abi: orderManagerAbi, eventName: "Cancelled", onLogs: refresh });
  useWatchContractEvent({ address: orderManager, abi: orderManagerAbi, eventName: "Refilled", onLogs: refresh });

  return items;
}

/// Real subname count for a parent name, from SubnameRegistered events — feeds the
/// domain detail page's "N subnames" box, linking our two real features together.
export function useSubnameCount(parentId: bigint): number {
  const client = usePublicClient();
  const { registry, fromBlock } = useContractAddresses();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const logs = await getContractEventsChunked(client, {
        address: registry,
        abi: registryAbi,
        eventName: "SubnameRegistered",
        args: { parentId },
        fromBlock,
      });
      setCount(logs.length);
    } catch (err) {
      console.error("useSubnameCount: failed to scan SubnameRegistered events", err);
    }
  }, [client, parentId, registry, fromBlock]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({ address: registry, abi: registryAbi, eventName: "SubnameRegistered", onLogs: refresh });

  return count;
}

export interface OwnedName {
  canonicalId: bigint;
  name: string;
}

/// Real "names in your wallet" for the list-a-domain picker — reduces Registered +
/// OwnerChanged event history to a current-owner map client-side (no indexer), rather
/// than requiring the user to type a name they already know they own.
export function useOwnedNames(owner: `0x${string}` | undefined): OwnedName[] {
  const client = usePublicClient();
  const { registry, fromBlock } = useContractAddresses();
  const [names, setNames] = useState<OwnedName[]>([]);

  const refresh = useCallback(async () => {
    if (!client || !owner) {
      setNames([]);
      return;
    }
    try {
      const [registered, ownerChanged] = await Promise.all([
        getContractEventsChunked(client, {
          address: registry,
          abi: registryAbi,
          eventName: "Registered",
          fromBlock,
        }),
        getContractEventsChunked(client, {
          address: registry,
          abi: registryAbi,
          eventName: "OwnerChanged",
          fromBlock,
        }),
      ]);
      const all = [...registered, ...ownerChanged].sort((a, b) => {
        const blockDiff = Number(a.blockNumber! - b.blockNumber!);
        return blockDiff !== 0 ? blockDiff : a.logIndex! - b.logIndex!;
      });

      const ownerOf = new Map<string, string>();
      const nameOf = new Map<string, string>();
      for (const log of all) {
        const args = log.args as Record<string, unknown>;
        const key = (args.canonicalId as bigint).toString();
        if (log.eventName === "Registered") {
          nameOf.set(key, args.name as string);
          ownerOf.set(key, args.owner as string);
        } else if (log.eventName === "OwnerChanged") {
          ownerOf.set(key, args.newOwner as string);
        }
      }

      const mine: OwnedName[] = [];
      for (const [key, o] of ownerOf) {
        if (o.toLowerCase() === owner.toLowerCase()) {
          mine.push({ canonicalId: BigInt(key), name: nameOf.get(key) ?? key });
        }
      }
      setNames(mine);
    } catch (err) {
      console.error("useOwnedNames: failed to scan Registered/OwnerChanged events", err);
    }
  }, [client, owner, registry, fromBlock]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({ address: registry, abi: registryAbi, eventName: "Registered", onLogs: refresh });
  useWatchContractEvent({ address: registry, abi: registryAbi, eventName: "OwnerChanged", onLogs: refresh });

  return names;
}
