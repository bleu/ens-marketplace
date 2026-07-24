"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatEther, parseEther } from "viem";
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { LEASE_VAULT_ADDRESS, REGISTRY_ADDRESS, SUBNAME_ADMIN_ROLE, leaseVaultAbi, registryAbi } from "@/lib/contracts";
import { formatDuration, isZeroAddress, shortAddr, shortId } from "@/lib/format";
import { parseCanonicalId } from "@/lib/canonicalId";
import { gradientFor } from "@/components/NameCard";

export default function SubnameDetailPage() {
  const params = useParams<{ canonicalId: string }>();
  const parsedCanonicalId = parseCanonicalId(params.canonicalId);
  // Hooks below must run unconditionally (rules of hooks), so an invalid id falls back
  // to 0n — a canonicalId that can never be registered — and the invalid-id message is
  // rendered explicitly further down rather than relying on the generic "doesn't exist"
  // fallthrough, so the user sees the actual bad value they navigated to.
  const canonicalId = parsedCanonicalId ?? 0n;
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
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

  const { data: callerHasRole } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "hasRole",
    args: address ? [canonicalId, SUBNAME_ADMIN_ROLE, address] : undefined,
    query: { enabled: !!address, refetchInterval: 3000 },
  });

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const listing = data?.[0]?.result as readonly [string, bigint, bigint, boolean] | undefined;
  const activeUntil = data?.[1]?.result as bigint | undefined;
  const tenant = data?.[2]?.result as string | undefined;
  const name = data?.[3]?.result as string | undefined;
  const vaultPreauthorized = data?.[4]?.result as boolean | undefined;

  if (parsedCanonicalId === null) {
    return (
      <main className="mx-auto max-w-[1400px] animate-[fadeIn_0.2s_var(--ease-out)] p-8">
        <Link href="/subnames" className="mb-6 inline-flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to subnames
        </Link>
        <div className="rounded-[var(--radius-3)] border p-10 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="font-[var(--font-display)] text-2xl font-light" style={{ color: "var(--fg)" }}>
            This name doesn&apos;t exist.
          </p>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            &quot;{params.canonicalId}&quot; is not a valid subname id.
          </p>
        </div>
      </main>
    );
  }

  if (!listing || activeUntil === undefined || tenant === undefined || name === undefined) {
    return <main className="p-8 font-mono text-sm text-[var(--fg-dim)]">Loading…</main>;
  }

  const [, pricePerTerm, termSeconds, active] = listing;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const isLeased = !isZeroAddress(tenant as `0x${string}`) && now < activeUntil;
  const isExpiredUnreclaimed = !isZeroAddress(tenant as `0x${string}`) && activeUntil !== 0n && now >= activeUntil;
  // `active` (the Listing struct's 4th field) is the contract's actual "announced for
  // rent" flag — rent() itself reverts NotListed() when it's false. A canonicalId that
  // was never announced still returns a zero-value Listing (active: false, tenant:
  // 0x0…0), so gating availability on "tenant is the zero address" alone (as before)
  // made every unannounced/nonexistent id read as rentable for 0 ETH.
  const isAvailable = active && !isLeased;

  // Same zero-value-struct problem one level up: nameOf() returning "" means nothing is
  // registered at this id at all, so don't render owner/tenant/price details as if it
  // were a real subname.
  if (!name) {
    return (
      <main className="mx-auto max-w-[1400px] animate-[fadeIn_0.2s_var(--ease-out)] p-8">
        <Link href="/subnames" className="mb-6 inline-flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to subnames
        </Link>
        <div className="rounded-[var(--radius-3)] border p-10 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="font-[var(--font-display)] text-2xl font-light" style={{ color: "var(--fg)" }}>
            This name doesn&apos;t exist.
          </p>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            No name is registered at canonical id {canonicalId.toString()}.
          </p>
        </div>
      </main>
    );
  }
  const isTenant = address?.toLowerCase() === tenant.toLowerCase();
  const busy = isPending || isConfirming;

  const withWallet = (fn: () => void) => () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    fn();
  };

  const rent = withWallet(() =>
    writeContract({ address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "rent", args: [canonicalId], value: pricePerTerm })
  );
  const reclaim = withWallet(() =>
    writeContract({ address: LEASE_VAULT_ADDRESS, abi: leaseVaultAbi, functionName: "reclaim", args: [canonicalId] })
  );
  const setLeasedResolver = withWallet(() =>
    writeContract({
      address: LEASE_VAULT_ADDRESS,
      abi: leaseVaultAbi,
      functionName: "setLeasedResolver",
      args: [canonicalId, resolver as `0x${string}`],
    })
  );
  const authorizeVault = withWallet(() =>
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "setRole",
      args: [canonicalId, SUBNAME_ADMIN_ROLE, LEASE_VAULT_ADDRESS, true],
    })
  );
  const announce = withWallet(() =>
    writeContract({
      address: LEASE_VAULT_ADDRESS,
      abi: leaseVaultAbi,
      functionName: "announceForRent",
      args: [canonicalId, parseEther(announcePrice || "0"), BigInt(Number(announceDays || "0") * 86400)],
    })
  );

  return (
    <main className="mx-auto max-w-[1400px] animate-[fadeIn_0.2s_var(--ease-out)] p-8">
      <Link href="/subnames" className="mb-6 inline-flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to subnames
      </Link>

      <div className="grid grid-cols-[420px_1fr] items-start gap-9">
        <div className="sticky top-[108px]">
          <div className="overflow-hidden rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
            <div className="flex aspect-square flex-col justify-between p-7" style={{ background: gradientFor(canonicalId) }}>
              <div style={{ width: 40, height: 58, background: "rgba(255,255,255,0.95)", clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
              <div className="font-sans text-[38px] font-bold break-all text-white" style={{ letterSpacing: "-0.02em" }}>
                {name ?? canonicalId.toString()}
              </div>
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center justify-between border-b px-[18px] py-3.5" style={{ borderColor: "var(--line)" }}>
              <span className="font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
                Price / term
              </span>
              <span className="font-mono text-[13px]" style={{ color: "var(--fg)" }}>
                {formatEther(pricePerTerm)} ETH
              </span>
            </div>
            <div className="flex items-center justify-between px-[18px] py-3.5">
              <span className="font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
                Term length
              </span>
              <span className="font-mono text-[13px]" style={{ color: "var(--fg)" }}>
                {formatDuration(Number(termSeconds))}
              </span>
            </div>
          </div>
        </div>

        {/* Sized to its own content rather than stretched to match the left
            media column's height — forcing that match left the trailing
            details card (just a Canonical ID / Registry / Lease vault /
            Tenant list) with a large blank void inside its own border. */}
        <div className="flex flex-col gap-5">
          {writeError && (
            <p className="font-mono text-xs" style={{ color: "var(--accent)" }}>
              {writeError.message.split("\n")[0]}
            </p>
          )}

          {isLeased && (
            <div className="rounded-[var(--radius-3)] border p-5" style={{ borderColor: "rgba(32,197,217,0.3)", background: "rgba(32,197,217,0.05)" }}>
              <p className="font-mono text-sm" style={{ color: "var(--brand)" }}>
                Currently leased to {shortAddr(tenant as `0x${string}`)} until{" "}
                {new Date(Number(activeUntil) * 1000).toLocaleString()}
              </p>
            </div>
          )}

          {isAvailable && !isExpiredUnreclaimed && !callerHasRole && (
            <button
              onClick={rent}
              disabled={busy}
              className="h-[52px] rounded-[var(--radius-2)] font-sans text-[15px] font-semibold disabled:opacity-50"
              style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
            >
              {busy ? "Confirming…" : `Rent for ${formatEther(pricePerTerm)} ETH`}
            </button>
          )}

          {isLeased && isTenant && (
            <div className="rounded-[var(--radius-3)] border p-6" style={{ borderColor: "var(--line)" }}>
              <p className="mb-3 font-sans text-sm font-medium" style={{ color: "var(--fg)" }}>
                Set leased resolver
              </p>
              <div className="flex gap-2">
                <input
                  value={resolver}
                  onChange={(e) => setResolver(e.target.value)}
                  placeholder="New resolver address"
                  className="input-field h-11 flex-1 rounded-[8px] border px-3 font-mono text-sm outline-none"
                  style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
                />
                <button
                  onClick={setLeasedResolver}
                  disabled={busy}
                  className="h-11 rounded-[var(--radius-2)] px-4 font-sans text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--fg)", color: "var(--bg)" }}
                >
                  Set resolver
                </button>
              </div>
            </div>
          )}

          {isExpiredUnreclaimed && (
            <button
              onClick={reclaim}
              disabled={busy}
              className="h-[52px] rounded-[var(--radius-2)] font-sans text-[15px] font-semibold disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
            >
              {busy ? "Confirming…" : "Reclaim (returns control to parent)"}
            </button>
          )}

          {callerHasRole && isAvailable && !vaultPreauthorized && (
            <div className="rounded-[var(--radius-3)] border p-6" style={{ borderColor: "var(--line)" }}>
              <p className="mb-3 font-mono text-sm" style={{ color: "var(--fg-muted)" }}>
                Authorize the rental vault before announcing — it needs to hold this
                subname&apos;s admin role for the lease term.
              </p>
              <button
                onClick={authorizeVault}
                disabled={busy}
                className="h-11 rounded-[var(--radius-2)] px-4 font-sans text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--fg)", color: "var(--bg)" }}
              >
                {busy ? "Confirming…" : "Authorize vault"}
              </button>
            </div>
          )}

          {callerHasRole && isAvailable && vaultPreauthorized && (
            <div className="rounded-[var(--radius-3)] border p-6" style={{ borderColor: "var(--line)" }}>
              <p className="mb-3 font-sans text-sm font-medium" style={{ color: "var(--fg)" }}>
                Announce for rent
              </p>
              <div className="flex gap-2">
                <input
                  value={announcePrice}
                  onChange={(e) => setAnnouncePrice(e.target.value)}
                  placeholder="Price (ETH)"
                  className="input-field h-11 flex-1 rounded-[8px] border px-3 font-mono text-sm outline-none"
                  style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
                />
                <input
                  value={announceDays}
                  onChange={(e) => setAnnounceDays(e.target.value)}
                  placeholder="Term (days)"
                  className="input-field h-11 flex-1 rounded-[8px] border px-3 font-mono text-sm outline-none"
                  style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
                />
                <button
                  onClick={announce}
                  disabled={busy || !announcePrice || !announceDays}
                  className="h-11 rounded-[var(--radius-2)] px-4 font-sans text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--fg)", color: "var(--bg)" }}
                >
                  Announce
                </button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
            {[
              { k: "Canonical ID", v: shortId(canonicalId.toString()), full: canonicalId.toString() },
              { k: "Registry", v: "Mock ENSv2 registry (local — not real Sepolia)" },
              { k: "Lease vault", v: shortAddr(LEASE_VAULT_ADDRESS) },
              { k: "Tenant", v: isZeroAddress(tenant as `0x${string}`) ? "None" : shortAddr(tenant as `0x${string}`) },
            ].map((d) => (
              <div key={d.k} className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
                <span className="font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
                  {d.k}
                </span>
                <span className="font-mono text-[13px]" style={{ color: "var(--fg)" }} title={d.full}>
                  {d.v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
