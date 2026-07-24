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
  const ids = useKnownDomainIds();

  const { data, isLoading } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, functionName: "orders", args: [id] } as const,
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "nameOf", args: [id] } as const,
    ]),
    query: { enabled: ids.length > 0, refetchInterval: 3000 },
  });

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
        <span className="ml-auto font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
          {rows.length} names
        </span>
      </div>

      <div className="grid grid-cols-[280px_1fr] items-start">
        {/* filters */}
        <aside className="sticky top-[76px] border-r p-6" style={{ borderColor: "var(--line)" }}>
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

          <div
            className="grid grid-cols-[minmax(260px,2.2fr)_168px_220px_150px_150px_110px] items-center border-b px-4 pb-3.5"
            style={{ borderColor: "var(--line-strong)" }}
          >
            {["Name", "Price", "Owner", "Last sale", "Highest offer", ""].map((h) => (
              <span key={h} className="font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
                {h}
              </span>
            ))}
          </div>

          {isLoading && rows.length === 0 && (
            <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading…
            </p>
          )}
          {!isLoading && rows.length === 0 && (
            <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
              No names to show in this tab yet.
            </p>
          )}

          {rows.map(({ id, order, name }) => (
            <ExploreRow key={id.toString()} id={id} order={order!} name={name} />
          ))}
        </section>
      </div>
    </main>
  );
}

function ExploreRow({ id, order, name }: { id: bigint; order: Order; name?: string }) {
  const [seller, price, , , , status] = order;
  const lastSale = useLastSale(id);

  return (
    <Link
      href={`/domains/${id.toString()}`}
      className="grid grid-cols-[minmax(260px,2.2fr)_168px_220px_150px_150px_110px] items-center border-b px-4 py-3.5"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex min-w-0 items-center gap-3.5">
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
          <StatusBadge variant={status === OrderStatus.Suspended ? "suspended" : "active"}>
            {status === OrderStatus.Suspended ? "Suspended" : "Active"}
          </StatusBadge>
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
        <span
          className="h-9 rounded-[var(--radius-2)] border px-4 py-2 font-sans text-[13px] font-medium"
          style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
        >
          Select
        </span>
      </div>
    </Link>
  );
}
