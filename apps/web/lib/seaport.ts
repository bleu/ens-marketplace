import { useMemo } from "react";
import { Seaport } from "@opensea/seaport-js";
import type { OrderWithCounter } from "@opensea/seaport-js/lib/types";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import type { Account, Chain, Client, Transport } from "viem";
import { useWalletClient } from "wagmi";
import type { EnsV1Listing } from "./ensv1";

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

/// Seaport's own pre-flight check (validateBasicFulfillBalancesAndApprovals) throws a
/// plain Error here when the connected wallet can't cover the listing — a real, common,
/// entirely expected outcome for a real-money flow, not a bug. Callers use this to route
/// it to a dedicated "insufficient balance" UI message instead of the generic error path
/// (and to skip logging it as a console.error, so an expected outcome doesn't trigger
/// Next's dev-mode error overlay as if the app had crashed).
export function isInsufficientBalanceError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /does not have the balances needed to fulfill/i.test(message) || /insufficient funds/i.test(message);
}

/// OpenSea's bulk browse feed (app/api/ensv1/listings) always returns
/// protocol_data.signature: null on every listing — verified live, it's display-only
/// data. A real, submittable signed order has to be fetched fresh, right before
/// fulfillment, from OpenSea's dedicated fulfillment-data endpoint (proxied server-side
/// via app/api/ensv1/opensea-fulfillment so OPENSEA_API_KEY stays out of the browser).
/// Grails' listings already carry a real signature from their own search API, so this
/// refetch only applies to source === "opensea".
async function fetchFreshOpenSeaOrder(
  listing: EnsV1Listing["listing"],
  fulfillerAddress: string,
): Promise<EnsV1Listing["listing"]["protocol_data"]> {
  const res = await fetch("/api/ensv1/opensea-fulfillment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderHash: listing.order_hash,
      protocolAddress: listing.protocol_address,
      fulfillerAddress,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Failed to fetch fresh OpenSea order data (${res.status})`);
  return json.protocol_data;
}

/// Fulfills a real listing (OpenSea- or Grails-sourced) on real mainnet — a genuine
/// on-chain purchase using the connected wallet's real ETH, matching what Grails' own
/// buyNowModal.tsx does (fulfillOrder -> executeAllActions, not a redirect to
/// opensea.io). Callers must confirm the wallet is on mainnet before calling this.
export async function fulfillListing(signer: JsonRpcSigner, listing: EnsV1Listing, accountAddress: string) {
  const protocolData =
    listing.source === "opensea"
      ? await fetchFreshOpenSeaOrder(listing.listing, accountAddress)
      : listing.listing.protocol_data;

  // The cast below works around a TypeScript dual-package hazard: seaport-js's shipped
  // .d.ts resolves its own "ethers" import to a different build (ESM vs CJS) than this
  // file's "ethers" import resolves to, so tsc sees two nominally distinct `Signer`
  // declarations for the exact same runtime class — a type-only mismatch, not a real one.
  const seaport = new Seaport(signer as unknown as ConstructorParameters<typeof Seaport>[0], {
    overrides: { contractAddress: listing.listing.protocol_address },
  });
  const useCase = await seaport.fulfillOrder({
    order: protocolData as unknown as OrderWithCounter,
    accountAddress,
  });
  return useCase.executeAllActions();
}
