"use client";

import Link from "next/link";
import { formatEther } from "viem";
import { useReadContracts } from "wagmi";
import { useKnownSubnameIds } from "@/lib/events";
import { LEASE_VAULT_ADDRESS, REGISTRY_ADDRESS, leaseVaultAbi, registryAbi } from "@/lib/contracts";
import { isZeroAddress } from "@/lib/format";

function statusOf(activeUntil: bigint, tenant: string): { label: string; style: string } {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (isZeroAddress(tenant as `0x${string}`) || activeUntil === 0n) {
    return { label: "Available", style: "bg-green-500/10 text-green-600 dark:text-green-400" };
  }
  if (now < activeUntil) {
    const mins = Math.ceil(Number(activeUntil - now) / 60);
    return { label: `Rented (${mins}m left)`, style: "bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  }
  return { label: "Lease expired — reclaim available", style: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
}

export default function SubnamesPage() {
  const ids = useKnownSubnameIds();

  const { data, isLoading } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "listings", args: [id] } as const,
      { address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "leaseActiveUntil", args: [id] } as const,
      { address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "tenantOf", args: [id] } as const,
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "nameOf", args: [id] } as const,
    ]),
    query: { enabled: ids.length > 0, refetchInterval: 3000 },
  });

  const rows = ids.map((id, i) => {
    const listing = data?.[i * 4]?.result as readonly [string, bigint, bigint, boolean] | undefined;
    const activeUntil = data?.[i * 4 + 1]?.result as bigint | undefined;
    const tenant = data?.[i * 4 + 2]?.result as string | undefined;
    const name = data?.[i * 4 + 3]?.result as string | undefined;
    return { id, listing, activeUntil, tenant, name };
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Subnames</h1>
        <Link href="/subnames/register" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
          Register a subname
        </Link>
      </div>

      {isLoading && ids.length > 0 && <p className="text-sm text-gray-500">Loading…</p>}
      {ids.length === 0 && <p className="text-sm text-gray-500">No subnames announced for rent yet.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rows.map(({ id, listing, activeUntil, tenant, name }) => {
          if (!listing || !listing[3] || activeUntil === undefined || tenant === undefined) return null;
          const [, pricePerTerm] = listing;
          const status = statusOf(activeUntil, tenant);
          return (
            <Link
              key={id.toString()}
              href={`/subnames/${id.toString()}`}
              className="rounded-xl border border-gray-200 p-4 transition-colors hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
            >
              <div className="flex items-start justify-between">
                <h2 className="font-medium">{name ?? id.toString()}</h2>
                <span className={`rounded px-2 py-0.5 text-xs ${status.style}`}>{status.label}</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">{formatEther(pricePerTerm)} ETH / term</p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
