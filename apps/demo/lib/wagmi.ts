import { createConfig, http } from "wagmi";
import { injected, safe, walletConnect } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";

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

/// `mainnet` is listed first, which makes it the chain wagmi reports before any wallet
/// connects. That's deliberate: mainnet is the one chain with data a wallet-less visitor
/// can actually see (the read-only ENSv1 view — see lib/network-mode.tsx), so the landing
/// view renders real listings instead of reading a chain nobody is on. Sepolia is where
/// our own ENSv2 mock marketplace lives (see lib/contracts.ts); real ENSv2 mainnet doesn't
/// exist yet.
///
/// http()'s URL arg is optional and falls back to the chain's public default RPC when
/// unset — exactly the kind of shared/rate-limited endpoint a public demo shouldn't depend
/// on, so these read from the dedicated RPC env vars (see apps/demo/README.md) when
/// configured, and otherwise fall back to a more reliable public archive node rather than
/// trusting the chain default silently — that default (thirdweb's public Sepolia endpoint)
/// fails outright under real load ("HttpRequestError: ... Details: Failed to fetch"),
/// confirmed live via the ENSv2 alpha detail page's activity scan, which fires several
/// eth_getLogs calls at once.
const SEPOLIA_FALLBACK_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export const wagmiConfig = createConfig({
  connectors,
  chains: [mainnet, sepolia],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_FALLBACK_RPC_URL),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL || undefined),
  },
  ssr: true,
});
