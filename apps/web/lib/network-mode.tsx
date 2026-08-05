"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Network, useCurrentNetwork } from "./contracts";

/// Which name universe the Domains section is currently browsing/searching:
/// - "ensv2": our own local mock marketplace (MockENSv2Registry + CanonicalIdOrderManager
///   on Anvil) — full read/write feature set (list/buy/relist/cancel).
/// - "ensv1": real mainnet ENS names, read-only ownership (via the ENS subgraph) plus
///   real OpenSea listings, with a real Seaport buy flow. Scoped to the Domains section
///   only — Subnames is an ENSv2-only differentiator with no ENSv1 equivalent.
/// - "ensv2-alpha": ENS Labs' own real ENSv2 alpha contracts on Sepolia (see
///   lib/ensv2-alpha.ts) — real commit-reveal registration paid in a real ERC-20, not our
///   mock. A genuinely different chain-address-pair from "ensv2" even though both happen
///   to run on Sepolia, which is why this is a UI-mode switch rather than a chainId one
///   (same reasoning as "ensv1" vs "ensv2" below).
export type NetworkMode = "ensv2" | "ensv1" | "ensv2-alpha";

const NetworkModeContext = createContext<[NetworkMode, (mode: NetworkMode) => void] | null>(null);

/// Each chain has exactly one mode that actually works against it (see the Source picker
/// on /domains, which only ever shows the one option matching the connected chain) —
/// keeps this map as the single source of truth for that pairing.
const DEFAULT_MODE_FOR_NETWORK: Record<Network, NetworkMode> = {
  [Network.Anvil]: "ensv2",
  [Network.Sepolia]: "ensv2-alpha",
  [Network.Mainnet]: "ensv1",
};

export function NetworkModeProvider({ children }: { children: React.ReactNode }) {
  const state = useState<NetworkMode>("ensv2");
  const [mode, setMode] = state;
  const currentNetwork = useCurrentNetwork();

  // Keeps `mode` following whichever chain is actually connected — on mount, and on any
  // later wallet-initiated chain switch — rather than defaulting to (and getting stuck on)
  // "ensv2" regardless of chain. Only resets when the current mode no longer belongs to
  // this chain at all, not just when it isn't that chain's default, so switching between
  // ENSv1/Grails/OpenSea while staying on Mainnet is left alone.
  useEffect(() => {
    const belongsToCurrentChain =
      (currentNetwork === Network.Anvil && mode === "ensv2") ||
      (currentNetwork === Network.Sepolia && mode === "ensv2-alpha") ||
      (currentNetwork === Network.Mainnet && mode === "ensv1");
    if (!belongsToCurrentChain) setMode(DEFAULT_MODE_FOR_NETWORK[currentNetwork]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNetwork]);

  return <NetworkModeContext.Provider value={state}>{children}</NetworkModeContext.Provider>;
}

export function useNetworkMode(): [NetworkMode, (mode: NetworkMode) => void] {
  const ctx = useContext(NetworkModeContext);
  if (!ctx) throw new Error("useNetworkMode must be used within NetworkModeProvider");
  return ctx;
}
