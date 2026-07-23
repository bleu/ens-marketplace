"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { LEASE_VAULT_ADDRESS, ORDER_MANAGER_ADDRESS, leaseVaultAbi, orderManagerAbi } from "./contracts";

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
