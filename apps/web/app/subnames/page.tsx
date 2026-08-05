"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useSubnameSearch } from "@/lib/events";
import { NameCard } from "@/components/NameCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ScrollHint } from "@/components/ScrollHint";

function statusOf(activeUntil: bigint | null, tenant: string | null): { label: string; variant: "active" | "suspended" | "neutral" } {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (!tenant || !activeUntil || activeUntil === 0n) {
    return { label: "Available", variant: "active" };
  }
  if (now < activeUntil) {
    const mins = Math.ceil(Number(activeUntil - now) / 60);
    return { label: `Rented (${mins}m left)`, variant: "neutral" };
  }
  return { label: "Reclaimable", variant: "suspended" };
}

export default function SubnamesPage() {
  const [page, setPage] = useState(1);
  const { rows, isLoading, isError, refetch: retry, totalPages } = useSubnameSearch(page);

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
                Couldn&apos;t load subnames.
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

          {rows.map(({ canonicalId, listing, tenant, leaseActiveUntil, name }) => {
            const status = statusOf(leaseActiveUntil, tenant);
            return (
              <Link
                key={canonicalId.toString()}
                href={`/subnames/${canonicalId.toString()}`}
                className="explore-row grid grid-cols-[minmax(260px,2.2fr)_220px_140px] items-center border-b pr-4 py-3.5"
                style={{ borderColor: "var(--line)" }}
              >
                <div
                  className="sticky left-0 z-10 flex items-center gap-3.5 self-stretch pl-4"
                  style={{ background: "var(--bg)" }}
                >
                  <NameCard canonicalId={canonicalId} />
                  <span className="font-sans text-base font-semibold" style={{ color: "var(--fg)" }}>
                    {name ?? canonicalId.toString()}
                  </span>
                </div>
                <div className="font-mono text-[15px]" style={{ color: "var(--fg)" }}>
                  {formatEther(listing.pricePerTerm)} ETH
                </div>
                <div className="justify-self-start">
                  <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                </div>
              </Link>
            );
          })}
        </div>
      </ScrollHint>

      {!isError && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 py-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            ← Previous
          </button>
          <span className="font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
