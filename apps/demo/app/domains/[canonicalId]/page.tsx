"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { formatEther, parseEther } from "viem";
import { useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ORDER_MANAGER_ADDRESS, OrderStatus, REGISTRY_ADDRESS, orderManagerAbi, registryAbi } from "@/lib/contracts";
import { computeStateHash } from "@/lib/statehash";
import { shortAddr } from "@/lib/format";

export default function DomainDetailPage() {
  const params = useParams<{ canonicalId: string }>();
  const canonicalId = BigInt(params.canonicalId);
  const { address } = useAccount();
  const [relistPrice, setRelistPrice] = useState("");

  const { data } = useReadContracts({
    contracts: [
      { address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, functionName: "orders", args: [canonicalId] },
      { address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, functionName: "diff", args: [canonicalId] },
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "nameOf", args: [canonicalId] },
    ],
    // Polling (rather than refetching on tx success) avoids a render-time side effect -
    // React 19 may double-invoke renders in dev, and refetch() isn't guaranteed idempotent
    // enough to call unconditionally mid-render. 3s of staleness after a tx is imperceptible here.
    query: { refetchInterval: 3000 },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const order = data?.[0]?.result;
  const diff = data?.[1]?.result;
  const name = data?.[2]?.result as string | undefined;

  if (!order) return <main className="p-8">Loading…</main>;

  const [seller, price, , , , status] = order as readonly [string, bigint, `0x${string}`, string, string, number];
  const isSeller = address?.toLowerCase() === seller.toLowerCase();
  const busy = isPending || isConfirming;

  const buy = () => writeContract({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, functionName: "buy", args: [canonicalId], value: price });
  const cancel = () => writeContract({ address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, functionName: "cancel", args: [canonicalId] });
  const relist = () =>
    writeContract({
      address: ORDER_MANAGER_ADDRESS,
      abi: orderManagerAbi,
      functionName: "relist",
      args: [canonicalId, parseEther(relistPrice || "0")],
    });
  const acceptDiffAndBuy = () => {
    if (!diff) return;
    const [, , liveOwner, liveResolver] = diff as readonly [string, string, string, string, boolean];
    const expectedHash = computeStateHash(liveOwner as `0x${string}`, liveResolver as `0x${string}`);
    writeContract({
      address: ORDER_MANAGER_ADDRESS,
      abi: orderManagerAbi,
      functionName: "acceptDiffAndRefill",
      args: [canonicalId, expectedHash],
      value: price,
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">{name ?? canonicalId.toString()}</h1>
      <p className="text-sm text-gray-500">
        Seller {shortAddr(seller as `0x${string}`)} · {formatEther(price)} ETH
      </p>

      {status === OrderStatus.Suspended && diff && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium text-amber-600 dark:text-amber-400">
            This name&apos;s state changed since it was listed — the order suspended
            itself instead of silently filling. See docs/architecture.md.
          </p>
          <DiffTable diff={diff as readonly [string, string, string, string, boolean]} />
        </div>
      )}

      {status === OrderStatus.Active && !isSeller && (
        <button
          onClick={buy}
          disabled={busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Confirming…" : `Buy for ${formatEther(price)} ETH`}
        </button>
      )}

      {status === OrderStatus.Suspended && !isSeller && (
        <button
          onClick={acceptDiffAndBuy}
          disabled={busy}
          className="rounded-md bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? "Confirming…" : "Accept new state and buy anyway"}
        </button>
      )}

      {isSeller && (status === OrderStatus.Active || status === OrderStatus.Suspended) && (
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-sm font-medium">Seller controls</p>
          <div className="flex gap-2">
            <input
              value={relistPrice}
              onChange={(e) => setRelistPrice(e.target.value)}
              placeholder="New price (ETH)"
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-transparent"
            />
            <button onClick={relist} disabled={busy} className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              Relist
            </button>
          </div>
          <button onClick={cancel} disabled={busy} className="rounded-md border border-red-500 px-3 py-1.5 text-sm text-red-500 disabled:opacity-50">
            Cancel listing
          </button>
        </div>
      )}

      {(status === OrderStatus.Filled || status === OrderStatus.Cancelled) && (
        <p className="text-sm text-gray-500">
          {status === OrderStatus.Filled ? "This name has been sold." : "This listing was cancelled."}
        </p>
      )}
    </main>
  );
}

function DiffTable({ diff }: { diff: readonly [string, string, string, string, boolean] }) {
  const [pinnedOwner, pinnedResolver, liveOwner, liveResolver] = diff;
  return (
    <table className="mt-2 w-full text-xs">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="pr-2 font-normal">Field</th>
          <th className="pr-2 font-normal">At listing</th>
          <th className="font-normal">Now</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="pr-2">Owner</td>
          <td className="pr-2">{shortAddr(pinnedOwner as `0x${string}`)}</td>
          <td>{shortAddr(liveOwner as `0x${string}`)}</td>
        </tr>
        <tr>
          <td className="pr-2">Resolver</td>
          <td className="pr-2">{shortAddr(pinnedResolver as `0x${string}`)}</td>
          <td>{shortAddr(liveResolver as `0x${string}`)}</td>
        </tr>
      </tbody>
    </table>
  );
}
