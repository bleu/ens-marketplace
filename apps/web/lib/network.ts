"use client";

import { useChainId } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

/// Chains this app knows about.
export enum Network {
  Sepolia = "sepolia",
  Mainnet = "mainnet",
}

const CHAIN_ID_TO_NETWORK: Record<number, Network> = {
  [sepolia.id]: Network.Sepolia,
  [mainnet.id]: Network.Mainnet,
};

/// Which of our known chains the wallet is on, or null for anything else — drives the
/// chain→mode pairing in lib/network-mode.tsx and which source options /domains offers.
export function useCurrentNetwork(): Network | null {
  const chainId = useChainId();
  return CHAIN_ID_TO_NETWORK[chainId] ?? null;
}
