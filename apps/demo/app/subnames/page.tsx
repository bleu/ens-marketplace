"use client";

import Link from "next/link";
import { formatEther } from "viem";
import { useReadContracts } from "wagmi";
import { useKnownSubnameIds } from "@/lib/events";
import { leaseVaultAbi, registryAbi, useContractAddresses } from "@/lib/contracts";
import { isZeroAddress } from "@/lib/format";
import { NameCard } from "@/components/NameCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ScrollHint } from "@/components/ScrollHint";

function statusOf(activeUntil: bigint, tenant: string): { label: string; variant: "active" | "suspended" | "neutral" } {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (isZeroAddress(tenant as `0x${string}`) || activeUntil === 0n) {
    return { label: "Available", variant: "active" };
  }
  if (now < activeUntil) {
    const mins = Math.ceil(Number(activeUntil - now) / 60);
    return { label: `Rented (${mins}m left)`, variant: "neutral" };
  }
  return { label: "Reclaimable", variant: "suspended" };
}

export default function SubnamesPage() {
  const { registry, leaseVault } = useContractAddresses();
  const { ids, isError: idsError, refetch: refetchIds } = useKnownSubnameIds();

  const { data, isLoading, isError: readsError, refetch: refetchReads } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: leaseVault, abi: leaseVaultAbi, functionName: "listings", args: [id] } as const,
      { address: leaseVault, abi: leaseVaultAbi, functionName: "leaseActiveUntil", args: [id] } as const,
      { address: leaseVault, abi: leaseVaultAbi, functionName: "tenantOf", args: [id] } as const,
      { address: registry, abi: registryAbi, functionName: "nameOf", args: [id] } as const,
    ]),
    query: { enabled: ids.length > 0, refetchInterval: 3000 },
  });

  const isError = idsError || readsError;
  const retry = () => {
    refetchIds();
    refetchReads();
  };

  const rows = ids
    .map((id, i) => ({
      id,
      listing: data?.[i * 4]?.result as readonly [string, bigint, bigint, boolean] | undefined,
      activeUntil: data?.[i * 4 + 1]?.result as bigint | undefined,
      tenant: data?.[i * 4 + 2]?.result as string | undefined,
      name: data?.[i * 4 + 3]?.result as string | undefined,
    }))
    .filter((r) => r.listing && r.listing[3] && r.activeUntil !== undefined && r.tenant !== undefined);

  return (
    <main className="animate-[fadeIn_0.2s_var(--ease-out)] px-4 pb-20 pt-8 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-[var(--font-display)] text-2xl font-light tracking-[var(--tracking-snug)]" style={{ color: "var(--fg)" }}>
          Subnames
        </h1>
        <Link
          href="/subnames/register"
          className="flex h-[42px] items-center rounded-[var(--radius-2)] px-5 font-sans text-sm font-semibold"
          style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
        >
          Register a subname
        </Link>
      </div>

      {/* Fixed-width Price/term and Status columns can't compress past a
          certain viewport without truncating illegibly. Contain the overflow
          to this table via its own scroll wrapper (same pattern as the
          /domains listing table) instead of letting it blow out the page. */}
      <ScrollHint className="no-scrollbar" arrowAlign="top">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[minmax(260px,2.2fr)_220px_140px] items-center border-b pr-4 pb-3.5" style={{ borderColor: "var(--line-strong)" }}>
            {["Name", "Price / term", "Status"].map((h, i) => (
              <span
                key={h}
                className={
                  i === 0
                    ? "sticky left-0 z-10 self-stretch pl-4 font-mono text-[11px] tracking-[0.04em] uppercase"
                    : "font-mono text-[11px] tracking-[0.04em] uppercase"
                }
                style={{ color: "var(--fg-dim)", ...(i === 0 ? { background: "var(--bg)" } : {}) }}
              >
                {h}
              </span>
            ))}
          </div>

          {isError && (
            <div className="flex items-center gap-3 py-8">
              <p className="font-mono text-sm" style={{ color: "var(--accent)" }}>
                Couldn&apos;t load subnames — the on-chain read failed.
              </p>
              <button
                onClick={retry}
                className="h-8 rounded-[var(--radius-2)] border px-3 font-mono text-xs"
                style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
              >
                Retry
              </button>
            </div>
          )}
          {!isError && isLoading && rows.length === 0 && (
            <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading…
            </p>
          )}
          {!isError && !isLoading && rows.length === 0 && (
            <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
              No subnames announced for rent yet.
            </p>
          )}

          {rows.map(({ id, listing, activeUntil, tenant, name }) => {
            const [, pricePerTerm] = listing!;
            const status = statusOf(activeUntil!, tenant!);
            return (
              <Link
                key={id.toString()}
                href={`/subnames/${id.toString()}`}
                className="explore-row grid grid-cols-[minmax(260px,2.2fr)_220px_140px] items-center border-b pr-4 py-3.5"
                style={{ borderColor: "var(--line)" }}
              >
                <div
                  className="sticky left-0 z-10 flex items-center gap-3.5 self-stretch pl-4"
                  style={{ background: "var(--bg)" }}
                >
                  <NameCard canonicalId={id} />
                  <span className="font-sans text-base font-semibold" style={{ color: "var(--fg)" }}>
                    {name ?? id.toString()}
                  </span>
                </div>
                <div className="font-mono text-[15px]" style={{ color: "var(--fg)" }}>
                  {formatEther(pricePerTerm)} ETH
                </div>
                <div className="justify-self-start">
                  <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                </div>
              </Link>
            );
          })}
        </div>
      </ScrollHint>
    </main>
  );
}
