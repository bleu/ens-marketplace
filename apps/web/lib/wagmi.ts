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
/// view renders live listings instead of reading a chain nobody is on. Sepolia is where
/// our own ENSv2 mock marketplace lives (see lib/contracts.ts); ENSv2 mainnet doesn't
/// exist yet.
///
/// http()'s URL arg is optional and falls back to the chain's public default RPC when
/// unset — exactly the kind of shared/rate-limited endpoint a public demo shouldn't depend
/// on, so these read from the dedicated RPC env vars (see apps/web/README.md) when
/// configured, and otherwise fall back to a more reliable public archive node rather than
/// trusting the chain default silently — that default (thirdweb's public Sepolia endpoint)
/// fails outright under real load ("HttpRequestError: ... Details: Failed to fetch"),
/// confirmed live via the ENSv2 alpha detail page's activity scan, which fires several
/// eth_getLogs calls at once.
const SEPOLIA_FALLBACK_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

/// Same reasoning as Sepolia above, and now load-bearing rather than precautionary: reverse
/// resolution (components/AddressLabel) puts a mainnet call behind ordinary page views, so
/// mainnet's chain default is no longer only the fulfillment path's problem. That default
/// (viem 2.47.12 points mainnet at eth.merkle.io) answers Cloudflare 1015 / HTTP 429 to an
/// unauthenticated caller, and a failed lookup is invisible — every address just stays hex,
/// which is also what "this account has no name" looks like.
const MAINNET_FALLBACK_RPC_URL = "https://ethereum-rpc.publicnode.com";

/// Reverse ENS lookups (components/AddressLabel) always target mainnet, whatever chain the
/// wallet is on — a mainnet eth_call firing while connected to Sepolia is deliberate, not a
/// bug. Reverse records only exist on mainnet: most addresses in this app come from the mock
/// ENSv2 registry on Sepolia, so resolving against the connected chain would make the
/// feature dead everywhere except the ENSv1 surfaces. Those addresses simply resolve to
/// nothing and keep showing hex.
///
/// Multicall batching, scoped to mainnet so Sepolia keeps its one-call-per-read behavior:
/// the Explore grid reverse-resolves every seller at once, and on a shared public endpoint
/// twenty separate eth_calls is how you get rate-limited. `wait` (default 0ms, i.e. same
/// tick) is the knob if the batch window turns out too tight to collect them all.
const MAINNET_BATCHING = { [mainnet.id]: { multicall: true } } as const;

/// RainbowKit maps both mainnet and Sepolia to the same stock Ethereum icon, so its chain
/// picker showed two identical rows that differed only in text. These are the same diamond
/// in two colors (papel for mainnet, salmao for the testnet) — same family, telling apart at
/// a glance. The generic `T` keeps each chain's literal `id`, which the `transports` keys and
/// `MAINNET_BATCHING` below are typed against.
function withIcon<T extends typeof mainnet | typeof sepolia>(chain: T, iconUrl: string) {
  return { ...chain, iconUrl, iconBackground: "transparent" };
}

export const wagmiConfig = createConfig({
  connectors,
  chains: [withIcon(mainnet, "/chains/ethereum.svg"), withIcon(sepolia, "/chains/sepolia.svg")],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_FALLBACK_RPC_URL),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL || MAINNET_FALLBACK_RPC_URL),
  },
  batch: MAINNET_BATCHING,
  ssr: true,
});
