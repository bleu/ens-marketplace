"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Network, useCurrentNetwork } from "./network";

/// Which name universe the Domains section is currently browsing/searching:
/// - "ensv1": real mainnet ENS names, read-only ownership (via the ENS subgraph) plus
///   real OpenSea listings, with a real Seaport buy flow.
/// - "ensv2-alpha": ENS Labs' own real ENSv2 alpha contracts on Sepolia (see
///   lib/ensv2-alpha.ts) — real commit-reveal registration paid in a real ERC-20.
export type NetworkMode = "ensv1" | "ensv2-alpha";

const NetworkModeContext = createContext<[NetworkMode, (mode: NetworkMode) => void] | null>(null);

/// Which mode a chain lands on when the current one doesn't apply to it.
const DEFAULT_MODE_FOR_NETWORK: Record<Network, NetworkMode> = {
  [Network.Sepolia]: "ensv2-alpha",
  [Network.Mainnet]: "ensv1",
};

const MODES_FOR_NETWORK: Record<Network, readonly NetworkMode[]> = {
  [Network.Sepolia]: ["ensv2-alpha"],
  [Network.Mainnet]: ["ensv1"],
};

export function NetworkModeProvider({ children }: { children: React.ReactNode }) {
  // "ensv1" matches mainnet, the chain wagmi reports before a wallet connects (see
  // lib/wagmi.ts) — so the landing view shows real mainnet listings rather than an empty
  // ENSv2 grid for a chain the visitor isn't on.
  const state = useState<NetworkMode>("ensv1");
  const [mode, setMode] = state;
  const currentNetwork = useCurrentNetwork();

  // Keeps `mode` following whichever chain is actually connected — on mount, and on any
  // later wallet-initiated chain switch. Only resets when the current mode no longer
  // belongs to this chain at all, not just when it isn't that chain's default, so
  // switching between ENSv1/Grails/OpenSea while staying on Mainnet is left alone. An
  // unrecognised chain is left alone too — ChainGuard is what tells the user about that.
  useEffect(() => {
    if (currentNetwork === null) return;
    if (!MODES_FOR_NETWORK[currentNetwork].includes(mode)) setMode(DEFAULT_MODE_FOR_NETWORK[currentNetwork]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNetwork]);

  return <NetworkModeContext.Provider value={state}>{children}</NetworkModeContext.Provider>;
}

export function useNetworkMode(): [NetworkMode, (mode: NetworkMode) => void] {
  const ctx = useContext(NetworkModeContext);
  if (!ctx) throw new Error("useNetworkMode must be used within NetworkModeProvider");
  return ctx;
}
