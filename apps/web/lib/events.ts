"use client";

import type { Abi, ContractEventName, GetContractEventsParameters, GetContractEventsReturnType } from "viem";
import { usePublicClient } from "wagmi";

type PublicClient = NonNullable<ReturnType<typeof usePublicClient>>;

/// Public RPCs commonly cap `eth_getLogs`' block range — the default Sepolia RPC
/// (thirdweb, wagmi.ts's fallback transport) rejects anything over 1000 blocks per
/// request ("Log response size exceeded... Maximum allowed number of requested blocks is
/// 1000", confirmed live while scanning the real ENSv2 alpha registry — see
/// lib/ensv2-alpha.ts). Scanning in windows under that cap, starting at the network's
/// actual deploy block rather than block 0, is what makes event scanning work at all
/// against a real chain's block height.
const MAX_BLOCK_RANGE = 900n;

/// Windows are fetched through a bounded worker pool rather than one unbounded
/// `Promise.all` — the window count grows every day since callers scan from a fixed
/// deploy block to the ever-advancing chain tip (see lib/ensv2-alpha.ts), and firing all
/// of them at once eventually outpaces whatever the configured RPC can sustain
/// concurrently. Confirmed live against the production Sepolia RPC: 20 concurrent
/// `eth_getLogs` calls all succeed, but a ~49-window burst (this integration's real
/// window count as of writing) never completes at all — one stalled/failed window fails
/// the whole `Promise.all`, which is exactly what produced "Couldn't load registrations."
const MAX_CONCURRENT_REQUESTS = 8;

export async function getContractEventsChunked<const abi extends Abi | readonly unknown[], eventName extends ContractEventName<abi>>(
  client: PublicClient,
  params: GetContractEventsParameters<abi, eventName> & { fromBlock: bigint },
): Promise<GetContractEventsReturnType<abi, eventName>> {
  const latest = await client.getBlockNumber();
  if (params.fromBlock > latest) return [] as GetContractEventsReturnType<abi, eventName>;

  const windows: Array<[bigint, bigint]> = [];
  for (let start = params.fromBlock; start <= latest; start += MAX_BLOCK_RANGE) {
    const end = start + MAX_BLOCK_RANGE - 1n > latest ? latest : start + MAX_BLOCK_RANGE - 1n;
    windows.push([start, end]);
  }

  const results: GetContractEventsReturnType<abi, eventName>[] = new Array(windows.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= windows.length) return;
      const [fromBlock, toBlock] = windows[i]!;
      results[i] = await client.getContractEvents({ ...params, fromBlock, toBlock });
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, windows.length) }, worker));
  return results.flat() as GetContractEventsReturnType<abi, eventName>;
}
