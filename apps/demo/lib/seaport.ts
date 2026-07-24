import { useMemo } from "react";
import { Seaport } from "@opensea/seaport-js";
import type { OrderWithCounter } from "@opensea/seaport-js/lib/types";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import type { Account, Chain, Client, Transport } from "viem";
import { useWalletClient } from "wagmi";
import type { OpenSeaListing } from "./ensv1";

/// seaport-js is built on ethers v6, not viem — this bridges wagmi's viem WalletClient to
/// an ethers Signer so we can reuse the same SDK Grails itself uses (@opensea/seaport-js),
/// rather than hand-rolling raw Seaport contract calls. Standard wagmi-to-ethers adapter
/// pattern (wagmi's own "ethers Adapters" docs), not something specific to this app.
function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client;
  const provider = new BrowserProvider(transport, { chainId: chain.id, name: chain.name });
  return new JsonRpcSigner(provider, account.address);
}

export function useEthersSigner() {
  const { data: walletClient } = useWalletClient();
  return useMemo(() => (walletClient ? clientToSigner(walletClient) : undefined), [walletClient]);
}

/// Fulfills a real OpenSea (Seaport) listing on real mainnet — a genuine on-chain
/// purchase using the connected wallet's real ETH, matching what Grails' own
/// buyNowModal.tsx does (fulfillOrder -> executeAllActions, not a redirect to
/// opensea.io). Callers must confirm the wallet is on mainnet before calling this.
export async function fulfillOpenSeaListing(
  signer: JsonRpcSigner,
  listing: OpenSeaListing,
  accountAddress: string,
) {
  // The cast below works around a TypeScript dual-package hazard: seaport-js's shipped
  // .d.ts resolves its own "ethers" import to a different build (ESM vs CJS) than this
  // file's "ethers" import resolves to, so tsc sees two nominally distinct `Signer`
  // declarations for the exact same runtime class — a type-only mismatch, not a real one.
  const seaport = new Seaport(signer as unknown as ConstructorParameters<typeof Seaport>[0], {
    overrides: { contractAddress: listing.protocol_address },
  });
  const useCase = await seaport.fulfillOrder({
    order: listing.protocol_data as unknown as OrderWithCounter,
    accountAddress,
  });
  return useCase.executeAllActions();
}
