import { createConfig, http } from "wagmi";
import { injected, safe, walletConnect } from "wagmi/connectors";
import { foundry, mainnet, sepolia } from "wagmi/chains";

const rawProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
// A real WalletConnect Cloud/Reown project id is a 32-char hex string. Checking for
// merely "non-empty" isn't enough — a checked-in placeholder value (e.g. "placeholder")
// is truthy but still not a real id, so it would slip past a plain `projectId ? … : []`
// guard and still trigger @reown/appkit's remote config fetch (and its HTTP 403) below.
const projectId = /^[0-9a-f]{32}$/i.test(rawProjectId) ? rawProjectId : "";

// Wagmi's own connectors, not RainbowKit's `@rainbow-me/rainbowkit/wallets` barrel.
// That barrel is a single monolithic module — importing any one wallet from it pulls in
// every wallet, including the Coinbase connector's @coinbase/cdp-sdk dependency (which
// has broken dynamic imports for Coinbase's x402 payment-protocol extensions, unrelated
// surface area we don't use in an ENS marketplace demo). RainbowKitProvider/ConnectButton
// still work fine against plain wagmi connectors.
// Only wire up the WalletConnect/Reown connector when a real project id is configured —
// initializing it with an empty/placeholder id makes @reown/appkit try (and fail, HTTP
// 403) to fetch remote project config on every page load for a connector that can't work
// anyway.
const connectors = [injected(), ...(projectId ? [walletConnect({ projectId })] : []), safe()];

/// `foundry` (chainId 31337, local Anvil) is listed first — it's the default demo chain
/// since the PoC currently runs against a local mock registry (see docs/local-demo.md),
/// not real ENSv2 Sepolia yet. Sepolia/mainnet stay wired for Slice 1/2 once that lands.
// viem/wagmi's built-in default RPC for Sepolia (thirdweb's public endpoint) is a
// shared, rate-limited free tier — under real load (e.g. the ENSv2 alpha detail page's
// activity scan, which fires several eth_getLogs calls at once) it fails outright with
// "HttpRequestError: ... Details: Failed to fetch", not just a slow response. Falls back
// to a more reliable public archive node when NEXT_PUBLIC_SEPOLIA_RPC_URL isn't
// configured (documented in .env.example), rather than trusting the chain-default silently.
const SEPOLIA_FALLBACK_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export const wagmiConfig = createConfig({
  connectors,
  chains: [foundry, sepolia, mainnet],
  transports: {
    [foundry.id]: http(),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_FALLBACK_RPC_URL),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL || undefined),
  },
  ssr: true,
});
