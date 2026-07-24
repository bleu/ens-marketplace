"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther, formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { useKnownDomainIds, useLastSale } from "@/lib/events";
import { ORDER_MANAGER_ADDRESS, OrderStatus, REGISTRY_ADDRESS, orderManagerAbi, registryAbi } from "@/lib/contracts";
import { useNetworkMode } from "@/lib/network-mode";
import { useEnsV1Listings, useGrailsListings } from "@/lib/ensv1-client";
import type { EnsV1Listing } from "@/lib/ensv1";
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

interface EnsV1FilterCriteria {
  source: "all" | "grails" | "opensea";
  priceInput: { min: string; max: string };
  lengthInput: { min: string; max: string };
  patternInput: { startsWith: string; endsWith: string };
}

/// Applied to every ENSv1 row regardless of source — for Grails this is redundant with
/// the real server-side filter (harmless, just a no-op re-check), but for OpenSea it's
/// the only filtering that happens at all, since OpenSea's listings endpoint has no
/// filter params — see useGrailsListings' doc comment.
function matchesFilters(l: EnsV1Listing, f: EnsV1FilterCriteria): boolean {
  if (f.source !== "all" && l.source !== f.source) return false;

  const priceEth = Number(formatUnits(BigInt(l.price.value), l.price.decimals));
  if (f.priceInput.min && priceEth < Number(f.priceInput.min)) return false;
  if (f.priceInput.max && priceEth > Number(f.priceInput.max)) return false;

  const label = l.name.replace(/\.eth$/i, "");
  if (f.lengthInput.min && label.length < Number(f.lengthInput.min)) return false;
  if (f.lengthInput.max && label.length > Number(f.lengthInput.max)) return false;

  if (f.patternInput.startsWith && !label.toLowerCase().startsWith(f.patternInput.startsWith.toLowerCase())) return false;
  if (f.patternInput.endsWith && !label.toLowerCase().endsWith(f.patternInput.endsWith.toLowerCase())) return false;

  return true;
}

export default function DomainsPage() {
  const [tab, setTab] = useState("names");
  const [networkMode, setNetworkMode] = useNetworkMode();
  const { ids, isError: idsError, refetch: refetchIds } = useKnownDomainIds();

  // Real filters for the ENSv1 view. Grails has an actual server-side filter schema, so
  // its query is re-run (debounced, to avoid hammering their API per keystroke) whenever
  // these change. OpenSea's listings endpoint has no filter params at all — the exact
  // same criteria are instead applied client-side to whatever page is already loaded,
  // via matchesFilters below, so at least the OpenSea rows on screen still narrow down
  // even though the underlying fetch can't be filtered server-side.
  const [source, setSource] = useState<"all" | "grails" | "opensea">("all");
  const [priceInput, setPriceInput] = useState({ min: "", max: "" });
  const [lengthInput, setLengthInput] = useState({ min: "", max: "" });
  const [patternInput, setPatternInput] = useState({ startsWith: "", endsWith: "" });
  const [grailsFilters, setGrailsFilters] = useState({
    minPrice: "",
    maxPrice: "",
    minLength: "",
    maxLength: "",
    startsWith: "",
    endsWith: "",
  });

  useEffect(() => {
    const t = setTimeout(() => {
      setGrailsFilters({
        minPrice: priceInput.min,
        maxPrice: priceInput.max,
        minLength: lengthInput.min,
        maxLength: lengthInput.max,
        startsWith: patternInput.startsWith,
        endsWith: patternInput.endsWith,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [priceInput, lengthInput, patternInput]);

  const opensea = useEnsV1Listings();
  const grails = useGrailsListings(grailsFilters);
  const ensv1Listings = [...grails.listings, ...opensea.listings].filter((l) =>
    matchesFilters(l, { source, priceInput, lengthInput, patternInput }),
  );

  const { data, isLoading, isError: readsError, refetch: refetchReads } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: ORDER_MANAGER_ADDRESS, abi: orderManagerAbi, functionName: "orders", args: [id] } as const,
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "nameOf", args: [id] } as const,
    ]),
    query: { enabled: ids.length > 0 && networkMode === "ensv2", refetchInterval: 3000 },
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
        {networkMode === "ensv2" ? (
          <>
            <Tabs items={TABS} active={tab} onChange={setTab} />
            <span className="ml-auto shrink-0 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
              {rows.length} names
            </span>
          </>
        ) : (
          <>
            <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
              Real listings — OpenSea + Grails
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
              {ensv1Listings.length} listed
            </span>
          </>
        )}
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
            Chain
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setNetworkMode("ensv2")}
              className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-left"
              style={
                networkMode === "ensv2"
                  ? { borderColor: "var(--brand)", background: "rgba(32,197,217,0.08)" }
                  : { borderColor: "var(--line)" }
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: networkMode === "ensv2" ? "var(--brand)" : "var(--color-profundo-300)" }}
                />
                <span
                  className="font-sans text-[13px] font-medium"
                  style={{ color: networkMode === "ensv2" ? "var(--fg)" : "var(--fg-muted)" }}
                >
                  Namechain (local, ENSv2)
                </span>
              </div>
              <span className="font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                {ids.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setNetworkMode("ensv1")}
              className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-left"
              style={
                networkMode === "ensv1"
                  ? { borderColor: "var(--brand)", background: "rgba(32,197,217,0.08)" }
                  : { borderColor: "var(--line)" }
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: networkMode === "ensv1" ? "var(--brand)" : "var(--color-profundo-300)" }}
                />
                <span
                  className="font-sans text-[13px] font-medium"
                  style={{ color: networkMode === "ensv1" ? "var(--fg)" : "var(--fg-muted)" }}
                >
                  Mainnet (L1, ENSv1)
                </span>
              </div>
            </button>
            {networkMode === "ensv1" && (
              <p className="mt-1 font-mono text-[11px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                Real ENS names on Ethereum mainnet, read-only. Listings below are real
                active OpenSea orders — buying executes a real on-chain purchase.
              </p>
            )}
          </div>

          <div
            className="mb-3 mt-6 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase"
            style={{ color: "var(--color-profundo-300)" }}
          >
            Refine
          </div>
          {networkMode === "ensv1" ? (
            <div className="flex flex-col gap-4">
              <div className="flex gap-1.5">
                {(["all", "grails", "opensea"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(s)}
                    className="h-8 flex-1 rounded-[var(--radius-1)] border font-mono text-[11px] uppercase"
                    style={
                      source === s
                        ? { borderColor: "var(--brand)", color: "var(--fg)", background: "rgba(32,197,217,0.08)" }
                        : { borderColor: "var(--line)", color: "var(--fg-muted)" }
                    }
                  >
                    {s === "all" ? "All" : s === "grails" ? "Grails" : "OpenSea"}
                  </button>
                ))}
              </div>

              <div>
                <div className="mb-1.5 font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                  Price (ETH)
                </div>
                <div className="flex gap-2">
                  <input
                    value={priceInput.min}
                    onChange={(e) => setPriceInput((p) => ({ ...p, min: e.target.value }))}
                    placeholder="Min"
                    aria-label="Minimum price in ETH"
                    inputMode="decimal"
                    className="input-field h-9 w-full rounded-[6px] border px-2.5 font-mono text-xs outline-none"
                    style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
                  />
                  <input
                    value={priceInput.max}
                    onChange={(e) => setPriceInput((p) => ({ ...p, max: e.target.value }))}
                    placeholder="Max"
                    aria-label="Maximum price in ETH"
                    inputMode="decimal"
                    className="input-field h-9 w-full rounded-[6px] border px-2.5 font-mono text-xs outline-none"
                    style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                  Length (chars)
                </div>
                <div className="flex gap-2">
                  <input
                    value={lengthInput.min}
                    onChange={(e) => setLengthInput((p) => ({ ...p, min: e.target.value }))}
                    placeholder="Min"
                    aria-label="Minimum name length"
                    inputMode="numeric"
                    className="input-field h-9 w-full rounded-[6px] border px-2.5 font-mono text-xs outline-none"
                    style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
                  />
                  <input
                    value={lengthInput.max}
                    onChange={(e) => setLengthInput((p) => ({ ...p, max: e.target.value }))}
                    placeholder="Max"
                    aria-label="Maximum name length"
                    inputMode="numeric"
                    className="input-field h-9 w-full rounded-[6px] border px-2.5 font-mono text-xs outline-none"
                    style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                  Starts with
                </div>
                <input
                  value={patternInput.startsWith}
                  onChange={(e) => setPatternInput((p) => ({ ...p, startsWith: e.target.value }))}
                  placeholder="e.g. sun"
                  aria-label="Name starts with"
                  className="input-field h-9 w-full rounded-[6px] border px-2.5 font-mono text-xs outline-none"
                  style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
                />
              </div>

              <div>
                <div className="mb-1.5 font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                  Ends with
                </div>
                <input
                  value={patternInput.endsWith}
                  onChange={(e) => setPatternInput((p) => ({ ...p, endsWith: e.target.value }))}
                  placeholder="e.g. dao"
                  aria-label="Name ends with"
                  className="input-field h-9 w-full rounded-[6px] border px-2.5 font-mono text-xs outline-none"
                  style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
                />
              </div>

              <p className="font-mono text-[10px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                Price/length/pattern filters query Grails&apos; real API directly. OpenSea
                has no filter API, so those filters only narrow whichever OpenSea listings
                are already loaded on this page.
              </p>
            </div>
          ) : (
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
          )}
        </aside>

        {/* table */}
        <section className="px-8 pb-20">
          {networkMode === "ensv1" ? (
            <EnsV1Table
              listings={ensv1Listings}
              isLoading={ensv1Listings.length === 0 && (opensea.isLoading || grails.isLoading)}
              bothErrored={opensea.isError && grails.isError}
              openseaError={opensea.isError}
              openseaNotConfigured={opensea.notConfigured}
              unresolvedCount={opensea.unresolvedCount}
              grailsUnresolvedCount={grails.unresolvedCount}
              grailsError={grails.isError}
              retryOpensea={opensea.refetch}
              retryGrails={grails.refetch}
            />
          ) : (
            <>
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
          <ScrollHint className="no-scrollbar" arrowAlign="top">
            <div className="min-w-[1058px]">
              <div
                className="grid grid-cols-[minmax(260px,2.2fr)_168px_220px_150px_150px_110px] items-center border-b pr-4 pb-3.5"
                style={{ borderColor: "var(--line-strong)" }}
              >
                {["Name", "Price", "Owner", "Last sale", "Highest offer", ""].map((h, i) => (
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
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function EnsV1Table({
  listings,
  isLoading,
  bothErrored,
  openseaError,
  openseaNotConfigured,
  unresolvedCount,
  grailsUnresolvedCount,
  grailsError,
  retryOpensea,
  retryGrails,
}: {
  listings: EnsV1Listing[];
  isLoading: boolean;
  bothErrored: boolean;
  openseaError: boolean;
  openseaNotConfigured: boolean;
  unresolvedCount: number;
  grailsUnresolvedCount: number;
  grailsError: boolean;
  retryOpensea: () => void;
  retryGrails: () => void;
}) {
  return (
    <ScrollHint className="no-scrollbar" arrowAlign="top">
      <div className="min-w-[900px]">
        <div
          className="grid grid-cols-[minmax(260px,2.2fr)_170px_220px_100px_110px] items-center border-b pr-4 pb-3.5"
          style={{ borderColor: "var(--line-strong)" }}
        >
          {["Name", "Price", "Seller", "Source", ""].map((h, i) => (
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

        {bothErrored && (
          <div className="flex items-center gap-3 py-8">
            <p className="font-mono text-sm" style={{ color: "var(--accent)" }}>
              Couldn&apos;t load real listings — both OpenSea and Grails requests failed.
            </p>
            <button
              onClick={() => {
                retryOpensea();
                retryGrails();
              }}
              className="h-8 rounded-[var(--radius-2)] border px-3 font-mono text-xs"
              style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
            >
              Retry
            </button>
          </div>
        )}
        {!bothErrored && isLoading && (
          <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            Loading real listings from OpenSea and Grails…
          </p>
        )}
        {!bothErrored && !isLoading && listings.length === 0 && (
          <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            No real ENS listings resolved on this page.
          </p>
        )}

        {listings.map((l) => (
          <EnsV1Row key={l.listing.order_hash} listing={l} />
        ))}

        {openseaNotConfigured && (
          <p className="py-3 font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
            OpenSea listings aren&apos;t configured — set <code style={{ color: "var(--fg)" }}>OPENSEA_API_KEY</code>{" "}
            in <code style={{ color: "var(--fg)" }}>apps/demo/.env.local</code> to include them too. Grails listings
            above don&apos;t need a key.
          </p>
        )}
        {!openseaNotConfigured && openseaError && !bothErrored && (
          <p className="py-3 font-mono text-[11px]" style={{ color: "var(--accent)" }}>
            OpenSea listings failed to load this time — Grails listings above are unaffected.
          </p>
        )}
        {grailsError && !bothErrored && (
          <p className="py-3 font-mono text-[11px]" style={{ color: "var(--accent)" }}>
            Grails listings failed to load this time — OpenSea listings above are unaffected.
          </p>
        )}
        {unresolvedCount > 0 && (
          <p className="py-3 font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {unresolvedCount} other active OpenSea listing{unresolvedCount === 1 ? "" : "s"} on this page couldn&apos;t
            be matched to a name via the subgraph and {unresolvedCount === 1 ? "isn't" : "aren't"} shown.
          </p>
        )}
        {grailsUnresolvedCount > 0 && (
          <p className="py-3 font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {grailsUnresolvedCount} other active Grails listing{grailsUnresolvedCount === 1 ? "" : "s"} on this page
            didn&apos;t include fulfillable order data and {grailsUnresolvedCount === 1 ? "isn't" : "aren't"} shown.
          </p>
        )}
      </div>
    </ScrollHint>
  );
}

function EnsV1Row({ listing }: { listing: EnsV1Listing }) {
  const seller = listing.listing.protocol_data.parameters.offerer as `0x${string}`;
  const price = formatUnits(BigInt(listing.price.value), listing.price.decimals);

  return (
    <Link
      href={`/domains/ensv1/${encodeURIComponent(listing.name)}`}
      className="explore-row grid grid-cols-[minmax(260px,2.2fr)_170px_220px_100px_110px] items-center border-b pr-4 py-3.5"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-3.5 self-stretch pl-4" style={{ background: "var(--bg)" }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-sans text-base font-semibold" style={{ color: "var(--fg)" }}>
              {listing.name}
            </span>
            <StatusBadge variant="chain">L1</StatusBadge>
          </div>
        </div>
      </div>
      <div className="font-mono text-[15px] font-medium" style={{ color: "var(--fg)" }}>
        {price} {listing.price.currency}
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
      <div>
        <span
          className="rounded-[5px] border px-2 py-[3px] font-mono text-[10px] tracking-[0.04em] uppercase"
          style={
            listing.source === "grails"
              ? { color: "var(--color-lima-500)", borderColor: "rgba(120,234,150,0.4)" }
              : { color: "var(--brand)", borderColor: "rgba(32,197,217,0.4)" }
          }
        >
          {listing.source === "grails" ? "Grails" : "OpenSea"}
        </span>
      </div>
      <div className="justify-self-end">
        <span className="select-pill h-9 rounded-[var(--radius-2)] border px-4 py-2 font-sans text-[13px] font-medium">
          Select
        </span>
      </div>
    </Link>
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
      className="explore-row grid grid-cols-[minmax(260px,2.2fr)_168px_220px_150px_150px_110px] items-center border-b pr-4 py-3.5"
      style={{ borderColor: "var(--line)" }}
    >
      <div
        className="sticky left-0 z-10 flex min-w-0 items-center gap-3.5 self-stretch pl-4"
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
