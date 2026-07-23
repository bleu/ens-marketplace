import { createConfig, http } from "wagmi";
import { injected, safe, walletConnect } from "wagmi/connectors";
import { foundry, mainnet, sepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

// Wagmi's own connectors, not RainbowKit's `@rainbow-me/rainbowkit/wallets` barrel.
// That barrel is a single monolithic module — importing any one wallet from it pulls in
// every wallet, including the Coinbase connector's @coinbase/cdp-sdk dependency (which
// has broken dynamic imports for Coinbase's x402 payment-protocol extensions, unrelated
// surface area we don't use in an ENS marketplace demo). RainbowKitProvider/ConnectButton
// still work fine against plain wagmi connectors.
const connectors = [injected(), walletConnect({ projectId }), safe()];

/// `foundry` (chainId 31337, local Anvil) is listed first — it's the default demo chain
/// since the PoC currently runs against a local mock registry (see docs/local-demo.md),
/// not real ENSv2 Sepolia yet. Sepolia/mainnet stay wired for Slice 1/2 once that lands.
export const wagmiConfig = createConfig({
  connectors,
  chains: [foundry, sepolia, mainnet],
  transports: {
    [foundry.id]: http(),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: true,
});
