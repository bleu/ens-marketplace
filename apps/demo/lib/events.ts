"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEther, type Log } from "viem";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import {
  LEASE_VAULT_ADDRESS,
  ORDER_MANAGER_ADDRESS,
  REGISTRY_ADDRESS,
  leaseVaultAbi,
  orderManagerAbi,
  registryAbi,
} from "./contracts";

/// No indexer at PoC stage (see docs/roadmap.md) — canonicalIds are discovered directly
/// from historical + live contract events. Once an ID is known, the pages that use these
/// hooks read its *current* state fresh via multicall (`useReadContracts`), rather than
/// reconstructing state by replaying event payloads — simpler and less bug-prone for a
/// local demo than a full client-side event reducer.
export function useKnownDomainIds(): bigint[] {
  const client = usePublicClient();
  const [ids, setIds] = useState<bigint[]>([]);

  const refresh = useCallback(async () => {
    if (!client) return;
    const logs = await client.getContractEvents({
      address: ORDER_MANAGER_ADDRESS,
      abi: orderManagerAbi,
      eventName: "Listed",
      fromBlock: 0n,
      toBlock: "latest",
    });
    setIds(Array.from(new Set(logs.map((log) => log.args.canonicalId as bigint))));
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({
    address: ORDER_MANAGER_ADDRESS,
    abi: orderManagerAbi,
    eventName: "Listed",
    onLogs: refresh,
  });

  return ids;
}

export function useKnownSubnameIds(): bigint[] {
  const client = usePublicClient();
  const [ids, setIds] = useState<bigint[]>([]);

  const refresh = useCallback(async () => {
    if (!client) return;
    const logs = await client.getContractEvents({
      address: LEASE_VAULT_ADDRESS,
      abi: leaseVaultAbi,
      eventName: "Announced",
      fromBlock: 0n,
      toBlock: "latest",
    });
    setIds(Array.from(new Set(logs.map((log) => log.args.canonicalId as bigint))));
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({
    address: LEASE_VAULT_ADDRESS,
    abi: leaseVaultAbi,
    eventName: "Announced",
    onLogs: refresh,
  });

  return ids;
}

export interface LastSale {
  price: bigint;
  at: number;
}

/// Real "last sale" derived from Filled/Refilled event history for a name — no fake
/// numbers, and no sale shown at all if the name has never actually changed hands.
export function useLastSale(canonicalId: bigint): LastSale | null {
  const client = usePublicClient();
  const [sale, setSale] = useState<LastSale | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    const [filled, refilled] = await Promise.all([
      client.getContractEvents({
        address: ORDER_MANAGER_ADDRESS,
        abi: orderManagerAbi,
        eventName: "Filled",
        args: { canonicalId },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client.getContractEvents({
        address: ORDER_MANAGER_ADDRESS,
        abi: orderManagerAbi,
        eventName: "Refilled",
        args: { canonicalId },
        fromBlock: 0n,
        toBlock: "latest",
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
  }, [client, canonicalId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, eventName: "Filled", onLogs: refresh });
  useWatchContractEvent({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, eventName: "Refilled", onLogs: refresh });

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
  const [items, setItems] = useState<ActivityItem[]>([]);

  const refresh = useCallback(async () => {
    if (!client) return;
    const eventNames = ["Listed", "Relisted", "Filled", "OrderSuspended", "Cancelled", "Refilled"] as const;
    const logsByEvent = await Promise.all(
      eventNames.map((eventName) =>
        client.getContractEvents({
          address: ORDER_MANAGER_ADDRESS,
          abi: orderManagerAbi,
          eventName,
          args: { canonicalId },
          fromBlock: 0n,
          toBlock: "latest",
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
  }, [client, canonicalId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, eventName: "Listed", onLogs: refresh });
  useWatchContractEvent({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, eventName: "Relisted", onLogs: refresh });
  useWatchContractEvent({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, eventName: "Filled", onLogs: refresh });
  useWatchContractEvent({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, eventName: "OrderSuspended", onLogs: refresh });
  useWatchContractEvent({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, eventName: "Cancelled", onLogs: refresh });
  useWatchContractEvent({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, eventName: "Refilled", onLogs: refresh });

  return items;
}

/// Real subname count for a parent name, from SubnameRegistered events — feeds the
/// domain detail page's "N subnames" box, linking our two real features together.
export function useSubnameCount(parentId: bigint): number {
  const client = usePublicClient();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!client) return;
    const logs = await client.getContractEvents({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      eventName: "SubnameRegistered",
      args: { parentId },
      fromBlock: 0n,
      toBlock: "latest",
    });
    setCount(logs.length);
  }, [client, parentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({ address: REGISTRY_ADDRESS, abi: registryAbi, eventName: "SubnameRegistered", onLogs: refresh });

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
  const [names, setNames] = useState<OwnedName[]>([]);

  const refresh = useCallback(async () => {
    if (!client || !owner) {
      setNames([]);
      return;
    }
    const [registered, ownerChanged] = await Promise.all([
      client.getContractEvents({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        eventName: "Registered",
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client.getContractEvents({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        eventName: "OwnerChanged",
        fromBlock: 0n,
        toBlock: "latest",
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
  }, [client, owner]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({ address: REGISTRY_ADDRESS, abi: registryAbi, eventName: "Registered", onLogs: refresh });
  useWatchContractEvent({ address: REGISTRY_ADDRESS, abi: registryAbi, eventName: "OwnerChanged", onLogs: refresh });

  return names;
}
