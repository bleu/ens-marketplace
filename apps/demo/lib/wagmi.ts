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

/// Foundry (local Anvil) only makes sense for local development — a real visitor to the
/// live site has no local chain to connect to, so offering it as a switchable network
/// there is just confusing dead weight (and was showing up as a literal "Foundry" option
/// in wallets on the production deployment). Vercel auto-populates NEXT_PUBLIC_VERCEL_ENV
/// for every deployment with no setup needed — this is undefined for local `pnpm dev`, so
/// Anvil stays available for local development by default.
export const ANVIL_ENABLED = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

/// `foundry` (chainId 31337, local Anvil) is listed first when enabled — it's the default
/// demo chain, since /domains defaults to the ENSv2 mock-marketplace view against it (see
/// docs/local-demo.md). The ENSv2 mock marketplace is also deployed to Sepolia (README
/// "Deployed addresses"); real ENSv2 mainnet doesn't exist yet.
///
/// http()'s URL arg is optional and falls back to the chain's public default RPC when
/// unset — fine for local dev, but exactly the kind of shared/rate-limited endpoint a
/// public demo shouldn't depend on, so these read from the dedicated RPC env vars
/// (documented in .env.example) when configured, and otherwise fall back to a more
/// reliable public archive node rather than trusting the chain default silently — that
/// default (thirdweb's public Sepolia endpoint) fails outright under real load ("HttpRequestError:
/// ... Details: Failed to fetch"), confirmed live via the ENSv2 alpha detail page's activity
/// scan, which fires several eth_getLogs calls at once.
const SEPOLIA_FALLBACK_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

/// Same reasoning as Sepolia above, and now load-bearing rather than precautionary: reverse
/// resolution (components/AddressLabel) puts a mainnet call behind ordinary page views, so
/// mainnet's chain default is no longer only the fulfillment path's problem. That default
/// (viem 2.47.12 points mainnet at eth.merkle.io) answers Cloudflare 1015 / HTTP 429 to an
/// unauthenticated caller, and a failed lookup is invisible — every address just stays hex,
/// which is also what "this account has no name" looks like.
const MAINNET_FALLBACK_RPC_URL = "https://ethereum-rpc.publicnode.com";

/// Reverse ENS lookups (components/AddressLabel) always target mainnet, whatever chain the
/// wallet is on — a mainnet eth_call firing while connected to Anvil is deliberate, not a
/// bug. Reverse records only exist on mainnet: most addresses in this app come from the
/// mock ENSv2 registry on Anvil or Sepolia, so resolving against the connected chain would
/// make the feature dead everywhere except the two ENSv1 surfaces. Those addresses simply
/// resolve to nothing and keep showing hex.
///
/// Multicall batching, scoped to mainnet so Anvil and Sepolia keep their one-call-per-read
/// behavior: the Explore grid reverse-resolves every seller at once, and on a shared public
/// endpoint twenty separate eth_calls is how you get rate-limited. `wait` (default 0ms, i.e.
/// same tick) is the knob if the batch window turns out too tight to collect them all.
const MAINNET_BATCHING = { [mainnet.id]: { multicall: true } } as const;

export const wagmiConfig = ANVIL_ENABLED
  ? createConfig({
      connectors,
      chains: [foundry, sepolia, mainnet],
      transports: {
        [foundry.id]: http(),
        [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_FALLBACK_RPC_URL),
        [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL || MAINNET_FALLBACK_RPC_URL),
      },
      batch: MAINNET_BATCHING,
      ssr: true,
    })
  : createConfig({
      connectors,
      chains: [sepolia, mainnet],
      transports: {
        [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_FALLBACK_RPC_URL),
        [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL || MAINNET_FALLBACK_RPC_URL),
      },
      batch: MAINNET_BATCHING,
      ssr: true,
    });
