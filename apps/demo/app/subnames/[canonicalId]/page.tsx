"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { formatEther, parseEther } from "viem";
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { LEASE_VAULT_ADDRESS, REGISTRY_ADDRESS, SUBNAME_ADMIN_ROLE, leaseVaultAbi, registryAbi } from "@/lib/contracts";
import { isZeroAddress, shortAddr } from "@/lib/format";

export default function SubnameDetailPage() {
  const params = useParams<{ canonicalId: string }>();
  const canonicalId = BigInt(params.canonicalId);
  const { address } = useAccount();
  const [resolver, setResolver] = useState("");
  const [announcePrice, setAnnouncePrice] = useState("");
  const [announceDays, setAnnounceDays] = useState("");

  const { data } = useReadContracts({
    contracts: [
      { address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "listings", args: [canonicalId] },
      { address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "leaseActiveUntil", args: [canonicalId] },
      { address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "tenantOf", args: [canonicalId] },
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "nameOf", args: [canonicalId] },
      {
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: "hasRole",
        args: [canonicalId, SUBNAME_ADMIN_ROLE, LEASE_VAULT_ADDRESS],
      },
    ],
    query: { refetchInterval: 3000 },
  });

  // Whether the connected wallet currently holds admin rights on this subname. Not
  // derived from listings[id].parent, which only gets populated after the *first*
  // announceForRent call - checking the role directly also works for a brand-new,
  // never-announced subname.
  const { data: callerHasRole } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "hasRole",
    args: address ? [canonicalId, SUBNAME_ADMIN_ROLE, address] : undefined,
    // Polling (rather than refetching on tx success) avoids a render-time side effect -
    // 3s of staleness after a tx is imperceptible here.
    query: { enabled: !!address, refetchInterval: 3000 },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const listing = data?.[0]?.result as readonly [string, bigint, bigint, boolean] | undefined;
  const activeUntil = data?.[1]?.result as bigint | undefined;
  const tenant = data?.[2]?.result as string | undefined;
  const name = data?.[3]?.result as string | undefined;
  const vaultPreauthorized = data?.[4]?.result as boolean | undefined;

  if (!listing || activeUntil === undefined || tenant === undefined) {
    return <main className="p-8">Loading…</main>;
  }

  const [, pricePerTerm, termSeconds] = listing;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const isLeased = !isZeroAddress(tenant as `0x${string}`) && now < activeUntil;
  const isExpiredUnreclaimed = !isZeroAddress(tenant as `0x${string}`) && activeUntil !== 0n && now >= activeUntil;
  const isAvailable = !isLeased;
  const isTenant = address?.toLowerCase() === tenant.toLowerCase();
  const busy = isPending || isConfirming;

  const rent = () => writeContract({ address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "rent", args: [canonicalId], value: pricePerTerm });
  const reclaim = () => writeContract({ address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "reclaim", args: [canonicalId] });
  const setLeasedResolver = () =>
    writeContract({
      address: LEASE_VAULT_ADDRESS,
      abi: leaseVaultAbi,
      functionName: "setLeasedResolver",
      args: [canonicalId, resolver as `0x${string}`],
    });
  const authorizeVault = () =>
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "setRole",
      args: [canonicalId, SUBNAME_ADMIN_ROLE, LEASE_VAULT_ADDRESS, true],
    });
  const announce = () =>
    writeContract({
      address: LEASE_VAULT_ADDRESS,
      abi: leaseVaultAbi,
      functionName: "announceForRent",
      args: [canonicalId, parseEther(announcePrice || "0"), BigInt(Number(announceDays || "0") * 86400)],
    });

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">{name ?? canonicalId.toString()}</h1>
      <p className="text-sm text-gray-500">
        {formatEther(pricePerTerm)} ETH / {(Number(termSeconds) / 86400).toFixed(1)} days
      </p>

      {isLeased && (
        <p className="text-sm text-blue-500">
          Currently leased to {shortAddr(tenant as `0x${string}`)} until{" "}
          {new Date(Number(activeUntil) * 1000).toLocaleString()}
        </p>
      )}

      {isAvailable && !callerHasRole && (
        <button onClick={rent} disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? "Confirming…" : `Rent for ${formatEther(pricePerTerm)} ETH`}
        </button>
      )}

      {isLeased && isTenant && (
        <div className="flex gap-2 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <input
            value={resolver}
            onChange={(e) => setResolver(e.target.value)}
            placeholder="New resolver address"
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-transparent"
          />
          <button onClick={setLeasedResolver} disabled={busy} className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            Set resolver
          </button>
        </div>
      )}

      {isExpiredUnreclaimed && (
        <button onClick={reclaim} disabled={busy} className="rounded-md bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50">
          {busy ? "Confirming…" : "Reclaim (returns control to parent)"}
        </button>
      )}

      {callerHasRole && isAvailable && !vaultPreauthorized && (
        <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
          <p className="mb-2 text-gray-500">
            Authorize the rental vault before announcing — it needs to hold this
            subname&apos;s admin role for the lease term (see docs/architecture.md).
          </p>
          <button onClick={authorizeVault} disabled={busy} className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {busy ? "Confirming…" : "Authorize vault"}
          </button>
        </div>
      )}

      {callerHasRole && isAvailable && vaultPreauthorized && (
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-sm font-medium">Announce for rent</p>
          <div className="flex gap-2">
            <input
              value={announcePrice}
              onChange={(e) => setAnnouncePrice(e.target.value)}
              placeholder="Price (ETH)"
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-transparent"
            />
            <input
              value={announceDays}
              onChange={(e) => setAnnounceDays(e.target.value)}
              placeholder="Term (days)"
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-transparent"
            />
            <button onClick={announce} disabled={busy} className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              Announce
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
