"use client";

import { useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useReadContracts } from "wagmi";
import { useKnownDomainIds, useLastSale } from "@/lib/events";
import { ORDER_MANAGER_ADDRESS, OrderStatus, REGISTRY_ADDRESS, orderManagerAbi, registryAbi } from "@/lib/contracts";
import { NameCard } from "@/components/NameCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, type TabItem } from "@/components/Tabs";
import { ComingSoon } from "@/components/ComingSoon";
import { ScrollHint } from "@/components/ScrollHint";
import { shortAddr } from "@/lib/format";

type Order = readonly [`0x${string}`, bigint, `0x${string}`, `0x${string}`, `0x${string}`, number];

const TABS: TabItem[] = [
  { id: "names", label: "Names" },
  { id: "listings", label: "Listings" },
  { id: "premium", label: "Premium", disabled: true },
  { id: "available", label: "Available", disabled: true },
  { id: "activity", label: "Activity", disabled: true },
];

export default function DomainsPage() {
  const [tab, setTab] = useState("names");
  const { ids, isError: idsError, refetch: refetchIds } = useKnownDomainIds();

  const { data, isLoading, isError: readsError, refetch: refetchReads } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, functionName: "orders", args: [id] } as const,
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "nameOf", args: [id] } as const,
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
      order: data?.[i * 2]?.result as Order | undefined,
      name: data?.[i * 2 + 1]?.result as string | undefined,
    }))
    .filter((r) => r.order)
    .filter((r) => (tab === "listings" ? r.order![5] === OrderStatus.Active || r.order![5] === OrderStatus.Suspended : true));

  return (
    <main className="animate-[fadeIn_0.2s_var(--ease-out)]">
      <div className="flex h-[60px] items-center gap-2 border-b px-8" style={{ borderColor: "var(--line)" }}>
        <Tabs items={TABS} active={tab} onChange={setTab} />
        <span className="ml-auto shrink-0 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
          {rows.length} names
        </span>
      </div>

      <div className="grid grid-cols-1 items-start lg:grid-cols-[280px_1fr]">
        {/* filters */}
        <aside className="border-b p-6 lg:sticky lg:top-[76px] lg:border-b-0 lg:border-r" style={{ borderColor: "var(--line)" }}>
          <div className="mb-5 flex items-center gap-2">
            <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
              Filters
            </span>
          </div>

          <div
            className="mb-6 mt-6 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase"
            style={{ color: "var(--color-profundo-300)" }}
          >
            Chain · ENSv2
          </div>
          <div className="flex flex-col gap-2">
            <div
              className="flex items-center justify-between rounded-lg border px-3 py-2.5"
              style={{ borderColor: "var(--brand)", background: "rgba(32,197,217,0.08)" }}
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--brand)" }} />
                <span className="font-sans text-[13px] font-medium" style={{ color: "var(--fg)" }}>
                  Namechain (local)
                </span>
              </div>
              <span className="font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                {ids.length}
              </span>
            </div>
            <ComingSoon>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-profundo-300)" }} />
                  <span className="font-sans text-[13px] font-medium" style={{ color: "var(--fg-muted)" }}>
                    Mainnet (L1)
                  </span>
                </div>
                <span className="font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                  0
                </span>
              </div>
            </ComingSoon>
          </div>

          <div
            className="mb-3 mt-6 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase"
            style={{ color: "var(--color-profundo-300)" }}
          >
            Refine
          </div>
          <ComingSoon>
            <div className="flex flex-col">
              {["Categories", "Status", "Has offers", "Has last sale", "Price range", "Marketplace"].map((label) => (
                <div
                  key={label}
                  className="flex h-11 items-center justify-between border-b"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="font-sans text-sm" style={{ color: "var(--fg-muted)" }}>
                    {label}
                  </span>
                  <span className="font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
                    Any
                  </span>
                </div>
              ))}
            </div>
          </ComingSoon>
        </aside>

        {/* table */}
        <section className="px-8 pb-20">
          <ComingSoon className="my-6">
            <div
              className="flex items-center gap-5 rounded-[var(--radius-3)] border p-5"
              style={{ borderColor: "var(--line)", background: "linear-gradient(90deg,rgba(32,197,217,0.09),rgba(17,25,42,0.4))" }}
            >
              <div className="flex-1">
                <div
                  className="mb-1.5 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase"
                  style={{ color: "var(--brand)" }}
                >
                  Collection bid
                </div>
                <div
                  className="font-[var(--font-display)] text-[26px] font-light tracking-[var(--tracking-snug)]"
                  style={{ color: "var(--fg)" }}
                >
                  Bid on an entire collection
                </div>
                <div className="mt-1.5 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
                  One offer, every name in a category. Fills the moment any holder accepts.
                </div>
              </div>
              <button
                className="h-11 rounded-[var(--radius-2)] border px-6 font-sans text-sm font-semibold"
                style={{ borderColor: "var(--brand)", color: "var(--brand)" }}
              >
                Place collection bid
              </button>
            </div>
          </ComingSoon>

          {/* This row grid has several fixed-width columns (price/owner/last
              sale/highest offer/select), so below a certain viewport it can't
              compress further without truncating illegibly. Rather than let
              that blow out the whole page's width (pushing the sidebar and
              top nav off-screen too), the horizontal scroll is contained to
              just this table via its own overflow-x-auto wrapper. */}
          <ScrollHint>
            <div className="min-w-[1058px]">
              <div
                className="grid grid-cols-[minmax(260px,2.2fr)_168px_220px_150px_150px_110px] items-center border-b px-4 pb-3.5"
                style={{ borderColor: "var(--line-strong)" }}
              >
                {["Name", "Price", "Owner", "Last sale", "Highest offer", ""].map((h, i) => (
                  <span
                    key={h}
                    className={
                      i === 0
                        ? "sticky left-4 z-10 self-stretch font-mono text-[11px] tracking-[0.04em] uppercase"
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
                    Couldn&apos;t load names — the on-chain read failed.
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
                  No names to show in this tab yet.
                </p>
              )}

              {rows.map(({ id, order, name }) => (
                <ExploreRow key={id.toString()} id={id} order={order!} name={name} />
              ))}
            </div>
          </ScrollHint>
        </section>
      </div>
    </main>
  );
}

/// Maps the on-chain OrderStatus (None/Active/Suspended/Filled/Cancelled) to a badge —
/// the Names tab shows every row with an order regardless of status (unlike the
/// Listings tab, which filters to Active/Suspended), so a sold or cancelled order
/// must read as such here rather than falling back to a buyable-looking "Active".
function statusBadge(status: number): { label: string; variant: "active" | "suspended" | "neutral" } {
  switch (status) {
    case OrderStatus.Suspended:
      return { label: "Suspended", variant: "suspended" };
    case OrderStatus.Filled:
      return { label: "Sold", variant: "neutral" };
    case OrderStatus.Cancelled:
      return { label: "Cancelled", variant: "neutral" };
    default:
      return { label: "Active", variant: "active" };
  }
}

function ExploreRow({ id, order, name }: { id: bigint; order: Order; name?: string }) {
  const [seller, price, , , , status] = order;
  const lastSale = useLastSale(id);
  const badge = statusBadge(status);

  return (
    <Link
      href={`/domains/${id.toString()}`}
      className="explore-row grid grid-cols-[minmax(260px,2.2fr)_168px_220px_150px_150px_110px] items-center border-b px-4 py-3.5"
      style={{ borderColor: "var(--line)" }}
    >
      <div
        className="sticky left-4 z-10 flex min-w-0 items-center gap-3.5 self-stretch"
        style={{ background: "var(--bg)" }}
      >
        <NameCard canonicalId={id} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-sans text-base font-semibold" style={{ color: "var(--fg)" }}>
              {name ?? id.toString()}
            </span>
            <StatusBadge variant="chain">L2</StatusBadge>
          </div>
        </div>
      </div>
      <div>
        <div className="font-mono text-[15px] font-medium" style={{ color: "var(--fg)" }}>
          {formatEther(price)} ETH
        </div>
        <div className="mt-0.5">
          <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
        </div>
      </div>
      <div>
        <span
          className="inline-flex items-center gap-2 rounded-full py-1 pr-2.5 pl-1"
          style={{ background: "rgba(242,244,241,0.05)" }}
        >
          <span className="h-5 w-5 rounded-full" style={{ background: "var(--color-profundo-500)" }} />
          <span className="font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
            {shortAddr(seller)}
          </span>
        </span>
      </div>
      <div className="font-mono text-[13px]" style={{ color: lastSale ? "var(--fg-muted)" : "var(--fg-dim)" }}>
        {lastSale ? `${formatEther(lastSale.price)} ETH` : "—"}
      </div>
      <ComingSoon>
        <div className="font-mono text-[13px]" style={{ color: "var(--fg-dim)" }}>
          —
        </div>
      </ComingSoon>
      <div className="justify-self-end">
        <span className="select-pill h-9 rounded-[var(--radius-2)] border px-4 py-2 font-sans text-[13px] font-medium">
          Select
        </span>
      </div>
    </Link>
  );
}
