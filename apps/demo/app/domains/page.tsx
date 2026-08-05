"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatEther, formatUnits } from "viem";
import { useDomainSearch, useLastSale } from "@/lib/events";
import { Network, OrderStatus, useCurrentNetwork } from "@/lib/contracts";
import { useNetworkMode } from "@/lib/network-mode";
import { cacheListingForNavigation, useEnsV1Listings, useGrailsListings } from "@/lib/ensv1-client";
import { openseaAssetUrl, type EnsV1Listing } from "@/lib/ensv1";
import { useEnsV2AlphaRegisteredNames, type EnsV2AlphaName } from "@/lib/ensv2-alpha";
import { AddressLabel } from "@/components/AddressLabel";
import { NameCard } from "@/components/NameCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, type TabItem } from "@/components/Tabs";
import { ComingSoon } from "@/components/ComingSoon";
import { ScrollHint } from "@/components/ScrollHint";
import { Spinner } from "@/components/Spinner";
import { shortId } from "@/lib/format";
import type { DomainOrderRow } from "@/lib/events";

const TABS: TabItem[] = [
  { id: "names", label: "Names" },
  { id: "listings", label: "Listings" },
  { id: "premium", label: "Premium", disabled: true },
  { id: "available", label: "Available", disabled: true },
  { id: "activity", label: "Activity", disabled: true },
];

interface EnsV1FilterCriteria {
  priceInput: { min: string; max: string };
  lengthInput: { min: string; max: string };
  patternInput: { startsWith: string; endsWith: string };
}

/// Applied to every ENSv1 row — for Grails this is redundant with the real server-side
/// filter (harmless, just a no-op re-check), but for OpenSea it's the only filtering that
/// happens at all, since OpenSea's listings endpoint has no filter params — see
/// useGrailsListings' doc comment. Grails and OpenSea are independent, mutually exclusive
/// sources (see the Refine source toggle below) rather than a merged/crossed set, so
/// there's no source field to check here — whichever hook is enabled already determines
/// the source of everything being filtered.
function matchesFilters(l: EnsV1Listing, f: EnsV1FilterCriteria): boolean {
  const priceEth = Number(formatUnits(BigInt(l.price.value), l.price.decimals));
  if (f.priceInput.min && priceEth < Number(f.priceInput.min)) return false;
  if (f.priceInput.max && priceEth > Number(f.priceInput.max)) return false;

  // A listing with no resolved name (see EnsV1Listing.name) has no label to check
  // length/pattern against — kept in the results (per the price check above) as long as
  // no length/pattern filter is actually active, rather than dropped outright.
  if (l.name === null) {
    return !f.lengthInput.min && !f.lengthInput.max && !f.patternInput.startsWith && !f.patternInput.endsWith;
  }

  const label = l.name.replace(/\.eth$/i, "");
  if (f.lengthInput.min && label.length < Number(f.lengthInput.min)) return false;
  if (f.lengthInput.max && label.length > Number(f.lengthInput.max)) return false;

  if (f.patternInput.startsWith && !label.toLowerCase().startsWith(f.patternInput.startsWith.toLowerCase())) return false;
  if (f.patternInput.endsWith && !label.toLowerCase().endsWith(f.patternInput.endsWith.toLowerCase())) return false;

  return true;
}

/// useSearchParams() requires an ancestor Suspense boundary (Next.js App Router build
/// requirement, not just a dev-mode nicety) — the default export below provides it so
/// `next build` doesn't fail, since the actual page body needs the hook to seed
/// page/filters from the URL on load.
export default function DomainsPage() {
  return (
    <Suspense fallback={<main className="p-4 font-mono text-sm text-[var(--fg-dim)] lg:p-8">Loading…</main>}>
      <DomainsPageInner />
    </Suspense>
  );
}

function DomainsPageInner() {
  const [tab, setTab] = useState("names");
  const [networkMode, setNetworkMode] = useNetworkMode();
  // Which source options are even relevant to show — each source only makes sense
  // against one specific chain (Local's mock contracts only exist on Anvil, the real
  // ENSv2 alpha only exists on Sepolia, ENSv1/Grails/OpenSea are all Ethereum mainnet
  // data), so this gates which buttons render rather than showing options that would
  // require a chain switch just to be meaningful.
  const currentNetwork = useCurrentNetwork();
  const alpha = useEnsV2AlphaRegisteredNames();
  const [ensv2Page, setEnsv2Page] = useState(1);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Any of these params only make sense in ENSv1 mode — if a shared/bookmarked link
  // carries one, switch to that view on load rather than leaving the visible mode as
  // the ENSv2 default while the URL (silently, to the user) already reflects ENSv1 state.
  // Runs once on mount only (via the ref guard) — syncUrl below deliberately leaves
  // these params in the URL when switching back to ENSv2 mode (so re-entering ENSv1
  // restores them), and if this effect re-ran on every searchParams change it would
  // immediately force the user back into ENSv1 mode the moment they tried to leave it.
  const hasAppliedUrlMode = useRef(false);
  useEffect(() => {
    if (hasAppliedUrlMode.current) return;
    hasAppliedUrlMode.current = true;
    const hasEnsV1Params = ["page", "refine", "priceMin", "priceMax", "lengthMin", "lengthMax", "startsWith", "endsWith"].some(
      (key) => searchParams.has(key),
    );
    if (hasEnsV1Params) setNetworkMode("ensv1");
  }, [searchParams, setNetworkMode]);

  // Real filters for the ENSv1 view. Grails has an actual server-side filter schema, so
  // its query is re-run (debounced, to avoid hammering their API per keystroke) whenever
  // these change. OpenSea's listings endpoint has no filter params at all — the exact
  // same criteria are instead applied client-side to whatever page is already loaded,
  // via matchesFilters below, so at least the OpenSea rows on screen still narrow down
  // even though the underlying fetch can't be filtered server-side.
  //
  // Page and every filter are seeded from the URL query string on first render (below)
  // and kept in sync with it (see the syncUrl effect further down) — this makes the
  // current view shareable/bookmarkable/restorable on refresh, e.g.
  // ?page=2&refine=opensea&priceMin=1&priceMax=5.
  const [source, setSource] = useState<"grails" | "opensea">(() => (searchParams.get("refine") === "opensea" ? "opensea" : "grails"));
  const [priceInput, setPriceInput] = useState({
    min: searchParams.get("priceMin") ?? "",
    max: searchParams.get("priceMax") ?? "",
  });
  const [lengthInput, setLengthInput] = useState({
    min: searchParams.get("lengthMin") ?? "",
    max: searchParams.get("lengthMax") ?? "",
  });
  const [patternInput, setPatternInput] = useState({
    startsWith: searchParams.get("startsWith") ?? "",
    endsWith: searchParams.get("endsWith") ?? "",
  });
  const [grailsFilters, setGrailsFilters] = useState({
    minPrice: searchParams.get("priceMin") ?? "",
    maxPrice: searchParams.get("priceMax") ?? "",
    minLength: searchParams.get("lengthMin") ?? "",
    maxLength: searchParams.get("lengthMax") ?? "",
    startsWith: searchParams.get("startsWith") ?? "",
    endsWith: searchParams.get("endsWith") ?? "",
  });

  // Pagination is a single "page" concept shared across both sources, even though
  // Grails paginates by plain page number and OpenSea by opaque cursor — see
  // useEnsV1Listings' doc comment for how the OpenSea side maps a page number back to
  // the right cursor. Reset to page 1 whenever the server-side (Grails) filters change,
  // since page 2 of a stale filter set doesn't mean anything once the filter changes.
  const [page, setPage] = useState(() => {
    const fromUrl = Number(searchParams.get("page"));
    return Number.isFinite(fromUrl) && fromUrl >= 1 ? fromUrl : 1;
  });

  // Skips the debounce's own recompute + page reset on the very first run — grailsFilters
  // and page are already correctly seeded straight from the URL above, so re-deriving
  // them from priceInput/lengthInput/patternInput on mount would just be redundant, and
  // resetting page to 1 on mount would stomp a `?page=3` from a shared/refreshed URL.
  const isFirstFilterSync = useRef(true);
  useEffect(() => {
    if (isFirstFilterSync.current) {
      isFirstFilterSync.current = false;
      return;
    }
    const t = setTimeout(() => {
      setGrailsFilters({
        minPrice: priceInput.min,
        maxPrice: priceInput.max,
        minLength: lengthInput.min,
        maxLength: lengthInput.max,
        startsWith: patternInput.startsWith,
        endsWith: patternInput.endsWith,
      });
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [priceInput, lengthInput, patternInput]);

  const syncUrl = useCallback(() => {
    if (networkMode !== "ensv1") return;
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (source !== "grails") params.set("refine", source);
    if (priceInput.min) params.set("priceMin", priceInput.min);
    if (priceInput.max) params.set("priceMax", priceInput.max);
    if (lengthInput.min) params.set("lengthMin", lengthInput.min);
    if (lengthInput.max) params.set("lengthMax", lengthInput.max);
    if (patternInput.startsWith) params.set("startsWith", patternInput.startsWith);
    if (patternInput.endsWith) params.set("endsWith", patternInput.endsWith);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [networkMode, page, source, priceInput, lengthInput, patternInput, pathname, router]);

  useEffect(() => {
    syncUrl();
  }, [syncUrl]);

  // Grails and OpenSea are strictly separate, mutually exclusive browsing modes — only
  // the currently-selected source's hook actually fetches (via `enabled`), and its
  // listings are shown as-is, never merged or cross-resolved with the other source.
  const opensea = useEnsV1Listings(page, source === "opensea");
  const grails = useGrailsListings(grailsFilters, page, source === "grails");
  const active = source === "grails" ? grails : opensea;
  const ensv1Listings = active.listings.filter((l) => matchesFilters(l, { priceInput, lengthInput, patternInput }));

  const search = useDomainSearch(tab === "listings" ? "listings" : "names", ensv2Page);
  const { rows, isLoading, isError, refetch: retry, total, totalPages } = search;

  const changeTab = (t: string) => {
    setTab(t);
    setEnsv2Page(1);
  };

  return (
    <main className="animate-[fadeIn_0.2s_var(--ease-out)]">
      <div className="flex h-[60px] items-center gap-2 border-b px-4 lg:px-8" style={{ borderColor: "var(--line)" }}>
        {networkMode === "ensv2" && (
          <>
            <Tabs items={TABS} active={tab} onChange={changeTab} />
            <span className="ml-auto shrink-0 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
              {total} names
            </span>
          </>
        )}
        {networkMode === "ensv1" && (
          <>
            <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
              Real listings — {source === "grails" ? "Grails" : "OpenSea"}
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
              {ensv1Listings.length} on this page
              {source === "grails" && grails.total !== null && <> · Grails has {grails.total.toLocaleString()} listings total</>}
            </span>
          </>
        )}
        {networkMode === "ensv2-alpha" && (
          <>
            <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
              Real ENSv2 · Sepolia Alpha
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
              {alpha.names.length} registered
            </span>
            <Link
              href="/domains/ensv2-alpha/register"
              className="flex h-9 shrink-0 items-center rounded-[var(--radius-2)] px-4 font-sans text-xs font-semibold"
              style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
            >
              Register a real name
            </Link>
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
            Source
          </div>
          <div className="flex flex-col gap-2">
            {currentNetwork === Network.Anvil && (
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
                    Local
                  </span>
                </div>
                <span className="font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                  {total}
                </span>
              </button>
            )}
            {currentNetwork === Network.Sepolia && (
              <>
                <button
                  type="button"
                  onClick={() => setNetworkMode("ensv2-alpha")}
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-left"
                  style={
                    networkMode === "ensv2-alpha"
                      ? { borderColor: "var(--brand)", background: "rgba(32,197,217,0.08)" }
                      : { borderColor: "var(--line)" }
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: networkMode === "ensv2-alpha" ? "var(--brand)" : "var(--color-profundo-300)" }}
                    />
                    <span
                      className="font-sans text-[13px] font-medium"
                      style={{ color: networkMode === "ensv2-alpha" ? "var(--fg)" : "var(--fg-muted)" }}
                    >
                      ENSv2
                    </span>
                  </div>
                  <span className="font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                    {alpha.names.length}
                  </span>
                </button>
                {networkMode === "ensv2-alpha" && (
                  <p className="mt-1 font-mono text-[11px] leading-relaxed" style={{ color: "var(--color-sinal-danger)" }}>
                    Connects to ENS Labs&apos; own real ENSv2 alpha contracts on Sepolia — not
                    our mock. Pre-audit, unofficial, unpublished addresses that can change
                    without notice. Registration spends real (test) Sepolia ETH/USDC.
                  </p>
                )}
              </>
            )}
            {currentNetwork === Network.Mainnet && (
              <>
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
                      ENSv1
                    </span>
                  </div>
                </button>
                {networkMode === "ensv1" && (
                  <p className="mt-1 font-mono text-[11px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                    Real ENS names on Ethereum mainnet, read-only. Listings below are real
                    active OpenSea orders — buying executes a real on-chain purchase.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setNetworkMode("ensv1");
                    setSource("grails");
                    setPage(1);
                  }}
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-left"
                  style={
                    networkMode === "ensv1" && source === "grails"
                      ? { borderColor: "var(--brand)", background: "rgba(32,197,217,0.08)" }
                      : { borderColor: "var(--line)" }
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: networkMode === "ensv1" && source === "grails" ? "var(--brand)" : "var(--color-profundo-300)",
                      }}
                    />
                    <span
                      className="font-sans text-[13px] font-medium"
                      style={{ color: networkMode === "ensv1" && source === "grails" ? "var(--fg)" : "var(--fg-muted)" }}
                    >
                      Grails
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNetworkMode("ensv1");
                    setSource("opensea");
                    setPage(1);
                  }}
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-left"
                  style={
                    networkMode === "ensv1" && source === "opensea"
                      ? { borderColor: "var(--brand)", background: "rgba(32,197,217,0.08)" }
                      : { borderColor: "var(--line)" }
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: networkMode === "ensv1" && source === "opensea" ? "var(--brand)" : "var(--color-profundo-300)",
                      }}
                    />
                    <span
                      className="font-sans text-[13px] font-medium"
                      style={{ color: networkMode === "ensv1" && source === "opensea" ? "var(--fg)" : "var(--fg-muted)" }}
                    >
                      OpenSea
                    </span>
                  </div>
                </button>
              </>
            )}
          </div>

          <div
            className="mb-3 mt-6 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase"
            style={{ color: "var(--color-profundo-300)" }}
          >
            Refine
          </div>
          {networkMode === "ensv2-alpha" ? (
            <p className="font-mono text-[11px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
              No filters yet — this reads real on-chain registrations directly, no indexer.
            </p>
          ) : networkMode === "ensv1" ? (
            <div className="flex flex-col gap-4">
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
        <section className="px-4 pb-20 lg:px-8">
          {networkMode === "ensv2-alpha" ? (
            <EnsV2AlphaTable names={alpha.names} isError={alpha.isError} retry={alpha.refetch} />
          ) : networkMode === "ensv1" ? (
            <EnsV1Table
              source={source}
              listings={ensv1Listings}
              isLoading={active.isLoading}
              isError={active.isError}
              notConfigured={source === "opensea" ? opensea.notConfigured : false}
              unresolvedCount={active.unresolvedCount}
              retry={active.refetch}
              page={page}
              grailsTotalPages={source === "grails" ? grails.totalPages : null}
              hasNext={active.hasNext}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
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
            <div
              className="min-w-[1058px] transition-opacity duration-150"
              style={{ opacity: isLoading && rows.length > 0 ? 0.5 : 1 }}
            >
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
                    Couldn&apos;t load names — the request failed.
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
                <div className="flex items-center gap-2.5 py-8">
                  <Spinner />
                  <p className="font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
                    Loading…
                  </p>
                </div>
              )}
              {!isError && !isLoading && rows.length === 0 && (
                <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
                  No names to show in this tab yet.
                </p>
              )}

              {rows.map(({ canonicalId, order, name }) => (
                <ExploreRow key={canonicalId.toString()} id={canonicalId} order={order} name={name ?? undefined} />
              ))}
            </div>
          </ScrollHint>

          {!isError && totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-6">
              <button
                onClick={() => setEnsv2Page((p) => Math.max(1, p - 1))}
                disabled={ensv2Page === 1 || isLoading}
                className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
                style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
              >
                ← Previous
              </button>
              <span className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
                {isLoading && <Spinner size={12} />}
                Page {ensv2Page} of {totalPages}
              </span>
              <button
                onClick={() => setEnsv2Page((p) => Math.min(totalPages, p + 1))}
                disabled={ensv2Page >= totalPages || isLoading}
                className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
                style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
              >
                Next →
              </button>
            </div>
          )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

const ENSV2_ALPHA_PAGE_SIZE = 20;

/// Real registered names on ENS Labs' own ENSv2 alpha Sepolia deployment — no filters yet
/// (see the sidebar note above this table). Deliberately simple compared to EnsV1Table/the
/// ensv2 mock table: this alpha has no price/seller/order concept, just a registered label
/// + tokenId. Pagination here is a client-side slice, not a paginated API call like
/// Grails/OpenSea — the full list is already in hand from the event scan
/// (useEnsV2AlphaRegisteredNames), so "next page" just moves the slice window rather than
/// fetching anything new.
function EnsV2AlphaTable({
  names,
  isError,
  retry,
}: {
  names: EnsV2AlphaName[];
  isError: boolean;
  retry: () => void;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(names.length / ENSV2_ALPHA_PAGE_SIZE));
  // Clamps down if the list shrinks (a page reload with fewer results) rather than
  // stranding the view on a now-nonexistent page with nothing to show.
  const clampedPage = Math.min(page, totalPages);
  const pageNames = names.slice((clampedPage - 1) * ENSV2_ALPHA_PAGE_SIZE, clampedPage * ENSV2_ALPHA_PAGE_SIZE);

  return (
    <>
      <ScrollHint className="no-scrollbar" arrowAlign="top">
      <div className="min-w-[520px]">
        <div
          className="grid grid-cols-[minmax(260px,2.2fr)_180px] items-center border-b pr-4 pb-3.5"
          style={{ borderColor: "var(--line-strong)" }}
        >
          {["Name", ""].map((h, i) => (
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
              Couldn&apos;t load real registrations — the on-chain read failed.
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
        {!isError && names.length === 0 && (
          <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            No names registered on this alpha deployment yet — be the first.
          </p>
        )}

        {pageNames.map(({ tokenId, label }) => (
          <Link
            key={tokenId.toString()}
            href={`/domains/ensv2-alpha/${encodeURIComponent(label)}`}
            className="explore-row grid grid-cols-[minmax(260px,2.2fr)_180px] items-center border-b pr-4 py-3.5"
            style={{ borderColor: "var(--line)" }}
          >
            <div className="sticky left-0 z-10 flex min-w-0 items-center gap-3.5 self-stretch pl-4" style={{ background: "var(--bg)" }}>
              <NameCard canonicalId={tokenId} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-sans text-base font-semibold" style={{ color: "var(--fg)" }}>
                    {label}
                  </span>
                  <StatusBadge variant="chain">Real L1</StatusBadge>
                </div>
              </div>
            </div>
            <div className="justify-self-end">
              <span className="select-pill h-9 rounded-[var(--radius-2)] border px-4 py-2 font-sans text-[13px] font-medium">
                View
              </span>
            </div>
          </Link>
        ))}
      </div>
      </ScrollHint>
      {!isError && names.length > ENSV2_ALPHA_PAGE_SIZE && (
        <div className="flex items-center justify-center gap-4 py-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={clampedPage === 1}
            className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            ← Previous
          </button>
          <span className="font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
            Page {clampedPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={clampedPage === totalPages}
            className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}

function EnsV1Table({
  source,
  listings,
  isLoading,
  isError,
  notConfigured,
  unresolvedCount,
  retry,
  page,
  grailsTotalPages,
  hasNext,
  onPrev,
  onNext,
}: {
  source: "grails" | "opensea";
  listings: EnsV1Listing[];
  isLoading: boolean;
  isError: boolean;
  notConfigured: boolean;
  unresolvedCount: number;
  retry: () => void;
  page: number;
  grailsTotalPages: number | null;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const sourceLabel = source === "grails" ? "Grails" : "OpenSea";
  return (
    <>
      <ScrollHint className="no-scrollbar" arrowAlign="top">
      <div className="min-w-[780px] transition-opacity duration-150" style={{ opacity: isLoading && listings.length > 0 ? 0.5 : 1 }}>
        <div
          className="grid grid-cols-[minmax(260px,2.2fr)_170px_220px_110px] items-center border-b pr-4 pb-3.5"
          style={{ borderColor: "var(--line-strong)" }}
        >
          {["Name", "Price", "Seller", ""].map((h, i) => (
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

        {notConfigured && (
          <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            OpenSea listings aren&apos;t configured — set <code style={{ color: "var(--fg)" }}>OPENSEA_API_KEY</code>{" "}
            in <code style={{ color: "var(--fg)" }}>apps/demo/.env.local</code> to browse them.
          </p>
        )}
        {!notConfigured && isError && (
          <div className="flex items-center gap-3 py-8">
            <p className="font-mono text-sm" style={{ color: "var(--accent)" }}>
              Couldn&apos;t load {sourceLabel} listings — the request failed.
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
        {!notConfigured && !isError && isLoading && listings.length === 0 && (
          <div className="flex items-center gap-2.5 py-8">
            <Spinner />
            <p className="font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading real listings from {sourceLabel}…
            </p>
          </div>
        )}
        {!notConfigured && !isError && !isLoading && listings.length === 0 && (
          <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            No real {sourceLabel} listings resolved on this page.
          </p>
        )}

        {listings.map((l) => (
          <EnsV1Row key={l.listing.order_hash} listing={l} />
        ))}

        {unresolvedCount > 0 && (
          <p className="py-3 font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {unresolvedCount} other active {sourceLabel} listing{unresolvedCount === 1 ? "" : "s"} on this page
            couldn&apos;t be resolved to a shown row and {unresolvedCount === 1 ? "isn't" : "aren't"} shown.
          </p>
        )}
      </div>
      </ScrollHint>
      {!notConfigured && !isError && (
        <div className="flex items-center justify-center gap-4 py-6">
          <button
            onClick={onPrev}
            disabled={page === 1 || isLoading}
            className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            ← Previous
          </button>
          <span className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
            {isLoading && <Spinner size={12} />}
            Page {page}
            {grailsTotalPages !== null && <> of ~{grailsTotalPages.toLocaleString()} (Grails)</>}
          </span>
          <button
            onClick={onNext}
            disabled={!hasNext || isLoading}
            className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}

/// A name-less row (see EnsV1Listing.name) can't route to our internal per-name detail
/// page (app/domains/ensv1/[name]) — that page looks everything up (subgraph ownership,
/// Grails/OpenSea by-name search) keyed on a real dotted name, which this listing doesn't
/// have. It's still a real, fulfillable OpenSea order though (see resolveListingNames), so
/// rather than hiding it, it links straight out to its OpenSea asset page instead.
function EnsV1Row({ listing }: { listing: EnsV1Listing }) {
  const seller = listing.listing.protocol_data.parameters.offerer as `0x${string}`;
  const price = formatUnits(BigInt(listing.price.value), listing.price.decimals);
  const offer = listing.listing.protocol_data.parameters.offer[0];

  const rowContent = (
    <>
      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-3.5 self-stretch pl-4" style={{ background: "var(--bg)" }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-sans text-base font-semibold" style={{ color: listing.name ? "var(--fg)" : "var(--fg-muted)" }}>
              {listing.name ?? `Unnamed · #${shortId(offer.identifierOrCriteria)}`}
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
          className="inline-flex max-w-full items-center gap-2 rounded-full py-1 pr-2.5 pl-1"
          style={{ background: "rgba(242,244,241,0.05)" }}
        >
          <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: "var(--color-profundo-500)" }} />
          {/* An ENS name has no length limit, unlike the 13 chars shortAddr always
              produced — without this the pill outgrows its grid column. */}
          <span className="min-w-0 truncate font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
            <AddressLabel address={seller} />
          </span>
        </span>
      </div>
      <div className="justify-self-end">
        <span className="select-pill h-9 rounded-[var(--radius-2)] border px-4 py-2 font-sans text-[13px] font-medium">
          {listing.name ? "Select" : "View on OpenSea"}
        </span>
      </div>
    </>
  );

  const rowClassName = "explore-row grid grid-cols-[minmax(260px,2.2fr)_170px_220px_110px] items-center border-b pr-4 py-3.5";
  const rowStyle = { borderColor: "var(--line)" };

  if (listing.name === null) {
    return (
      <a href={openseaAssetUrl(offer.token as `0x${string}`, offer.identifierOrCriteria)} target="_blank" rel="noreferrer" className={rowClassName} style={rowStyle}>
        {rowContent}
      </a>
    );
  }

  return (
    <Link
      href={`/domains/ensv1/${encodeURIComponent(listing.name)}`}
      onClick={() => {
        if (listing.source === "opensea") cacheListingForNavigation(listing);
      }}
      className={rowClassName}
      style={rowStyle}
    >
      {rowContent}
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

function ExploreRow({ id, order, name }: { id: bigint; order: DomainOrderRow; name?: string }) {
  const { seller, price, status } = order;
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
          className="inline-flex max-w-full items-center gap-2 rounded-full py-1 pr-2.5 pl-1"
          style={{ background: "rgba(242,244,241,0.05)" }}
        >
          <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: "var(--color-profundo-500)" }} />
          {/* An ENS name has no length limit, unlike the 13 chars shortAddr always
              produced — without this the pill outgrows its grid column. */}
          <span className="min-w-0 truncate font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
            <AddressLabel address={seller} />
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
