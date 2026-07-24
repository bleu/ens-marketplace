"use client";

import { createContext, useContext, useState } from "react";

/// Which name universe the Domains section is currently browsing/searching:
/// - "ensv2": our own local mock marketplace (MockENSv2Registry + CanonicalIdOrderManager
///   on Anvil) — full read/write feature set (list/buy/relist/cancel).
/// - "ensv1": real mainnet ENS names, read-only ownership (via the ENS subgraph) plus
///   real OpenSea listings, with a real Seaport buy flow. Scoped to the Domains section
///   only — Subnames is an ENSv2-only differentiator with no ENSv1 equivalent.
export type NetworkMode = "ensv2" | "ensv1";

const NetworkModeContext = createContext<[NetworkMode, (mode: NetworkMode) => void] | null>(null);

export function NetworkModeProvider({ children }: { children: React.ReactNode }) {
  const state = useState<NetworkMode>("ensv2");
  return <NetworkModeContext.Provider value={state}>{children}</NetworkModeContext.Provider>;
}

export function useNetworkMode(): [NetworkMode, (mode: NetworkMode) => void] {
  const ctx = useContext(NetworkModeContext);
  if (!ctx) throw new Error("useNetworkMode must be used within NetworkModeProvider");
  return ctx;
}
