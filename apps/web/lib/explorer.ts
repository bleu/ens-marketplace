import { Network } from "./contracts";

/// Local Otterscan convention for the Anvil devnet (self-hosted, e.g. `docker run
/// otterscan/otterscan` pointed at `http://localhost:8545` — port 5100 is Otterscan's own
/// default) — per Slack: "i guess we using otterscan for v2/anvil? that was dope for
/// keyring". Etherscan can't index a private/local chain at all, so this is the only
/// option for Anvil; Sepolia and Mainnet are real public chains Etherscan already
/// supports directly (our Sepolia contracts are Etherscan-verified — see lib/contracts.ts).
const EXPLORER_BASE_URL: Record<Network, string> = {
  [Network.Anvil]: "http://localhost:5100",
  [Network.Sepolia]: "https://sepolia.etherscan.io",
  [Network.Mainnet]: "https://etherscan.io",
};

/// Otterscan intentionally mirrors Etherscan's URL scheme for compatibility, so a single
/// path shape works for both explorers here.
export function explorerAddressUrl(network: Network, address: string): string {
  return `${EXPLORER_BASE_URL[network]}/address/${address}`;
}

export function explorerTxUrl(network: Network, hash: string): string {
  return `${EXPLORER_BASE_URL[network]}/tx/${hash}`;
}
