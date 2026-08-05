import { Network } from "./network";

/// Both chains we link out to are real public ones Etherscan indexes directly.
const EXPLORER_BASE_URL: Record<Network, string> = {
  [Network.Sepolia]: "https://sepolia.etherscan.io",
  [Network.Mainnet]: "https://etherscan.io",
};

export function explorerAddressUrl(network: Network, address: string): string {
  return `${EXPLORER_BASE_URL[network]}/address/${address}`;
}

export function explorerTxUrl(network: Network, hash: string): string {
  return `${EXPLORER_BASE_URL[network]}/tx/${hash}`;
}
