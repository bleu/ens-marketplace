"use client";

import Link from "next/link";
import { formatEther } from "viem";
import { useReadContracts } from "wagmi";
import { useKnownDomainIds } from "@/lib/events";
import { ORDER_MANAGER_ADDRESS, OrderStatus, REGISTRY_ADDRESS, orderManagerAbi, registryAbi } from "@/lib/contracts";

const STATUS_LABEL: Record<number, string> = {
  [OrderStatus.Active]: "Active",
  [OrderStatus.Suspended]: "Suspended — state changed",
  [OrderStatus.Filled]: "Sold",
  [OrderStatus.Cancelled]: "Cancelled",
};

const STATUS_STYLE: Record<number, string> = {
  [OrderStatus.Active]: "bg-green-500/10 text-green-600 dark:text-green-400",
  [OrderStatus.Suspended]: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  [OrderStatus.Filled]: "bg-gray-500/10 text-gray-500",
  [OrderStatus.Cancelled]: "bg-gray-500/10 text-gray-500",
};

export default function DomainsPage() {
  const ids = useKnownDomainIds();

  const { data, isLoading } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, functionName: "orders", args: [id] } as const,
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "nameOf", args: [id] } as const,
    ]),
    query: { enabled: ids.length > 0, refetchInterval: 3000 },
  });

  const rows = ids.map((id, i) => {
    const order = data?.[i * 2]?.result as
      | readonly [string, bigint, `0x${string}`, string, string, number]
      | undefined;
    const name = data?.[i * 2 + 1]?.result as string | undefined;
    return { id, order, name };
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Domains</h1>
        <Link href="/domains/list" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
          List a domain
        </Link>
      </div>

      {isLoading && ids.length > 0 && <p className="text-sm text-gray-500">Loading…</p>}
      {ids.length === 0 && <p className="text-sm text-gray-500">No domains listed yet.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rows.map(({ id, order, name }) => {
          if (!order) return null;
          const [seller, price, , , , status] = order;
          return (
            <Link
              key={id.toString()}
              href={`/domains/${id.toString()}`}
              className="rounded-xl border border-gray-200 p-4 transition-colors hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
            >
              <div className="flex items-start justify-between">
                <h2 className="font-medium">{name ?? id.toString()}</h2>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>
                  {STATUS_LABEL[status] ?? status}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-500">{formatEther(price)} ETH</p>
              <p className="mt-1 text-xs text-gray-400">Seller {seller.slice(0, 6)}…{seller.slice(-4)}</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
