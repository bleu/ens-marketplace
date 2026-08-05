"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatUnits } from "viem";
import { useNetworkMode } from "@/lib/network-mode";
import { cacheListingForNavigation, useGrailsListings } from "@/lib/ensv1-client";
import {
  activeFilterSummary,
  EMPTY_FILTERS,
  ExploreFilters,
  exploreFiltersFromQuery,
  exploreFiltersToQuery,
  FilterLabel,
  FilterSummary,
  FILTER_INPUT_CLASS,
  toGrailsFilters,
  type ExploreFilterState,
} from "@/components/ExploreFilters";
import { openseaAssetUrl, type EnsV1Listing } from "@/lib/ensv1";
import { useEnsV2AlphaRegisteredNames, type EnsV2AlphaName } from "@/lib/ensv2-alpha";
import { AddressLabel } from "@/components/AddressLabel";
import { gradientFor, NameCard } from "@/components/NameCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ScrollHint } from "@/components/ScrollHint";
import { Spinner } from "@/components/Spinner";
import { formatTokenAmount, shortId } from "@/lib/format";

/// Nothing filters listings in the browser. The feed is Grails-only (our own Postgres — see
/// useGrailsListings), so every filter and the count are real server-side queries, and the
/// header's total is a count of the same set the user can page through. The client-side
/// re-filter this replaces existed for OpenSea, whose listings endpoint takes no filter params
/// at all; OpenSea now stays on the detail page, where per-name lookups work fine. See
/// docs/explore-filters.md.

/// How long a keystroke waits before it becomes a query.
const FILTER_DEBOUNCE_MS = 400;

/// useSearchParams() requires an ancestor Suspense boundary (Next.js App Router build
/// requirement, not just a dev-mode nicety) — the default export below provides it so
/// `next build` doesn't fail, since the actual page body needs the hook to seed
/// page/filters from the URL on load.
export default function DomainsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex items-center gap-2.5 px-4 py-16 font-mono text-sm text-[var(--fg-dim)] lg:px-8">
          <Spinner />
          Loading…
        </main>
      }
    >
      <DomainsPageInner />
    </Suspense>
  );
}

function DomainsPageInner() {
  const [networkMode] = useNetworkMode();
  const alpha = useEnsV2AlphaRegisteredNames();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Seeded from the URL on first render and kept in sync with it (see the syncUrl effect
  // below), so a filtered view is shareable, bookmarkable and survives a refresh.
  const [filters, setFilters] = useState<ExploreFilterState>(() => exploreFiltersFromQuery(searchParams));
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(() => {
    const fromUrl = Number(searchParams.get("page"));
    return Number.isFinite(fromUrl) && fromUrl >= 1 ? fromUrl : 1;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Alpha has no price/order data (registration only), so length + pattern are the only
  // filters that apply — no server to push them to, so this filters the already-loaded
  // `alpha.names` client-side (see EnsV2AlphaTable).
  const [alphaFilters, setAlphaFilters] = useState<AlphaFilterState>(EMPTY_ALPHA_FILTERS);

  // Debounced so a query doesn't fire per keystroke. Skipped on the first run: appliedFilters
  // is already seeded from the same URL, and resetting page here would stomp a shared `?page=3`.
  const isFirstFilterSync = useRef(true);
  useEffect(() => {
    if (isFirstFilterSync.current) {
      isFirstFilterSync.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setAppliedFilters(filters);
      // Page 2 of a filter set that no longer applies means nothing.
      setPage(1);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  const syncUrl = useCallback(() => {
    if (networkMode !== "ensv1") return;
    const params = new URLSearchParams(exploreFiltersToQuery(appliedFilters));
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    // Skip a replace that wouldn't change the URL. On a plain /domains visit every value is
    // still its default, so this would otherwise fire `replace("/domains")` at the URL it was
    // already on — harmless-looking, but that in-flight replace lands *after* a quick click on
    // another nav link and yanks the user straight back to /domains.
    if (qs === searchParams.toString()) return;
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [networkMode, appliedFilters, page, pathname, router, searchParams]);

  useEffect(() => {
    syncUrl();
  }, [syncUrl]);

  const grails = useGrailsListings(toGrailsFilters(appliedFilters), page);
  // Whichever sidebar is on screen, so the heading's badge and the empty state's way out
  // don't have to care which chain is connected.
  const activeFilterCount =
    networkMode === "ensv2-alpha" ? alphaFilterSummary(alphaFilters).length : activeFilterSummary(appliedFilters).length;

  return (
    <main className="animate-[fadeIn_0.2s_var(--ease-out)]">
      {/* Sticks directly under the top nav (76px tall) so the feed's name and count stay put
          while a long page of rows scrolls past. Opaque, since rows pass beneath it. */}
      <div
        className="sticky top-[76px] z-30 flex h-[60px] items-center gap-3 border-b px-4 lg:px-8"
        style={{ borderColor: "var(--line)", background: "var(--bg)" }}
      >
        {networkMode === "ensv1" && (
          <>
            <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
              Listings
            </span>
            {/* A real count of the filtered set, not of this page — every filter is applied
                server-side, so this is the number of rows the user can actually reach. */}
            <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums" style={{ color: "var(--fg-dim)" }}>
              {grails.total === null ? (
                grails.isLoading && <Spinner size={12} />
              ) : (
                <>
                  {grails.total.toLocaleString()} listing{grails.total === 1 ? "" : "s"}
                </>
              )}
            </span>
          </>
        )}
        {networkMode === "ensv2-alpha" && (
          <>
            <span className="truncate font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
              ENSv2 · Sepolia Alpha
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs tabular-nums" style={{ color: "var(--fg-dim)" }}>
              {alpha.names.length.toLocaleString()} registered
            </span>
            <Link
              href="/domains/ensv2-alpha/register"
              className="btn-cta flex h-9 shrink-0 items-center rounded-[var(--radius-2)] px-4 font-sans text-xs font-semibold whitespace-nowrap"
              style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
            >
              Register a name
            </Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 items-start lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* filters — a raised card rather than an open column, so the controls read as one
            group instead of floating loose beside the table. On a narrow viewport the card's
            body collapses into a drawer, so a tall filter column doesn't push the table below
            the fold. The card's top edge lines up with the table's column labels. */}
        <aside className="px-4 py-5 lg:sticky lg:top-[136px] lg:py-6 lg:pr-6 lg:pl-8">
          <div
            className="rounded-[var(--radius-3)] border p-4 lg:p-5"
            style={{ borderColor: "var(--line)", background: "var(--bg-raised)" }}
          >
            <div className={`flex items-center gap-2 ${drawerOpen ? "mb-5" : "mb-0 lg:mb-5"}`}>
              <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
                Filters
              </span>
              {activeFilterCount > 0 && (
                <span
                  className="rounded-full px-2 py-[2px] font-mono text-[10px] tabular-nums"
                  style={{ background: "rgba(var(--brand-rgb),0.14)", color: "var(--brand)" }}
                >
                  {activeFilterCount}
                </span>
              )}
              <button
                type="button"
                onClick={() => setDrawerOpen((open) => !open)}
                aria-expanded={drawerOpen}
                className="btn-outline ml-auto h-8 rounded-[var(--radius-2)] border px-3 font-mono text-xs lg:hidden"
              >
                {drawerOpen ? "Hide" : "Show"}
              </button>
            </div>

            <div className={drawerOpen ? "block" : "hidden lg:block"}>
              {networkMode === "ensv2-alpha" ? (
                <AlphaFilters state={alphaFilters} onChange={setAlphaFilters} />
              ) : (
                <ExploreFilters state={filters} onChange={setFilters} />
              )}
            </div>
          </div>
        </aside>

        {/* table — full-bleed, so row separators line up with the header's border above
            instead of stopping short of it, and a hovered row tints edge to edge. The
            gutters live on the row grids themselves (GUTTER_LEFT/GUTTER_RIGHT below), and
            the top padding main added on this section now lives on TableHeader. */}
        <section className="min-w-0 pb-20">
          {networkMode === "ensv2-alpha" ? (
            <EnsV2AlphaTable
              names={alpha.names}
              isLoading={alpha.isLoading}
              isError={alpha.isError}
              retry={alpha.refetch}
              filters={alphaFilters}
              onClearFilters={() => setAlphaFilters(EMPTY_ALPHA_FILTERS)}
            />
          ) : (
            <EnsV1Table
              listings={grails.listings}
              isLoading={grails.isLoading}
              isError={grails.isError}
              retry={grails.refetch}
              activeFilterCount={activeFilterCount}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
              page={page}
              totalPages={grails.totalPages}
              hasNext={grails.hasNext}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          )}
        </section>
      </div>
    </main>
  );
}

/// Row gutters. The tables are full-bleed, so each row carries the page's own horizontal
/// padding rather than inheriting it from a padded container: the sticky name cell owns the
/// left gutter, the row itself the right one. Kept here so a row and its column header can't
/// drift out of alignment.
const GUTTER_LEFT = "pl-4 lg:pl-8";
const GUTTER_RIGHT = "pr-4 lg:pr-8";

/// The gap between the name column and whatever follows it. Padding inside the cell rather
/// than a grid gap, because the cell is sticky and paints an opaque background — a gap would
/// leave a bare stripe beside it with the other columns visibly sliding underneath.
const NAME_CELL_GUTTER = "pr-4";

/// Column tracks, shared between each table's header and its rows. Price and seller take
/// fractions rather than fixed widths so a wide screen spreads the slack across the table
/// instead of pouring all of it into the name column and leaving a dead band mid-row.
const ENSV1_COLUMNS = "grid-cols-[minmax(240px,1.7fr)_minmax(120px,0.55fr)_minmax(170px,0.75fr)_150px]";
const ENSV2_ALPHA_COLUMNS = "grid-cols-[minmax(240px,1fr)_110px]";

const PAGER_BUTTON =
  "btn-outline h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs whitespace-nowrap disabled:opacity-40";
const ACTION_PILL =
  "select-pill flex h-9 items-center rounded-[var(--radius-2)] border px-4 font-sans text-[13px] font-medium whitespace-nowrap";

/// `pt` matches the filter sidebar's own top padding, so the column labels and the sidebar's
/// "Filters" heading start on the same line.
function TableHeader({ columns, labels }: { columns: string; labels: string[] }) {
  return (
    <div
      className={`grid ${columns} items-center border-b pt-5 pb-3 lg:pt-6 ${GUTTER_RIGHT}`}
      style={{ borderColor: "var(--line-strong)" }}
    >
      {labels.map((label, i) => (
        <span
          key={label || "actions"}
          className={`font-mono text-[11px] tracking-[0.08em] uppercase ${
            i === 0 ? `explore-table-head-sticky sticky left-0 z-10 self-stretch ${GUTTER_LEFT} ${NAME_CELL_GUTTER}` : ""
          }`}
          style={{ color: "var(--fg-dim)" }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/// A table's loading / empty / error state. Rendered outside the horizontally scrolling
/// wrapper on purpose: a sentence has no columns to reveal, and inside the wrapper's
/// min-width a phone would have to scroll sideways to read the end of it.
function TableMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 px-4 py-14 font-mono text-sm lg:px-8">{children}</div>;
}

/// One pager for both tables, so the two can't drift apart. `totalPages` is null while a
/// feed hasn't reported a count yet.
function Pager({
  page,
  totalPages,
  hasPrev,
  hasNext,
  isLoading,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number | null;
  hasPrev: boolean;
  hasNext: boolean;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 pt-8 lg:px-8">
      <button onClick={onPrev} disabled={!hasPrev || isLoading} className={PAGER_BUTTON}>
        ← Previous
      </button>
      {/* Fixed width so swapping the spinner in, or ticking over to a wider page number,
          doesn't nudge the two buttons sideways. */}
      <span
        className="flex min-w-[140px] items-center justify-center gap-2 font-mono text-xs tabular-nums"
        style={{ color: "var(--fg-dim)" }}
      >
        {isLoading && <Spinner size={12} />}
        Page {page.toLocaleString()}
        {totalPages !== null && <> of {totalPages.toLocaleString()}</>}
      </span>
      <button onClick={onNext} disabled={!hasNext || isLoading} className={PAGER_BUTTON}>
        Next →
      </button>
    </div>
  );
}

/// Matches the ENSv1 feed's page size, which apps/api fixes at 50 server-side
/// (GrailsService's PAGE_SIZE) — so a page means the same thing in both tables.
const ENSV2_ALPHA_PAGE_SIZE = 50;

/// Alpha has no price/order data (registration only), so length + pattern are the only
/// filters that apply to it — see the sidebar note in EnsV2AlphaTable.
interface AlphaFilterState {
  lengthMin: string;
  lengthMax: string;
  startsWith: string;
  endsWith: string;
}

const EMPTY_ALPHA_FILTERS: AlphaFilterState = { lengthMin: "", lengthMax: "", startsWith: "", endsWith: "" };

function matchesAlphaFilters(name: EnsV2AlphaName, f: AlphaFilterState): boolean {
  const len = name.label.length;
  if (f.lengthMin && len < Number(f.lengthMin)) return false;
  if (f.lengthMax && len > Number(f.lengthMax)) return false;
  if (f.startsWith && !name.label.toLowerCase().startsWith(f.startsWith.toLowerCase())) return false;
  if (f.endsWith && !name.label.toLowerCase().endsWith(f.endsWith.toLowerCase())) return false;
  return true;
}

/// Mirrors activeFilterSummary for the ENSv1 sidebar — same phrasing for the filters the two
/// have in common, so the chips don't read differently depending on which chain you're on.
function alphaFilterSummary(state: AlphaFilterState): string[] {
  const parts: string[] = [];
  if (state.lengthMin) parts.push(`${state.lengthMin}+ chars`);
  if (state.lengthMax) parts.push(`${state.lengthMax} chars or fewer`);
  if (state.startsWith) parts.push(`starts “${state.startsWith}”`);
  if (state.endsWith) parts.push(`ends “${state.endsWith}”`);
  return parts;
}

/// Dressed from the same pieces as ExploreFilters (FilterLabel, FILTER_INPUT_CLASS,
/// FilterSummary) rather than its own copies — the two swap in and out of the same sidebar
/// slot, so any styling drift shows up as the panel changing shape when the chain changes.
function AlphaFilters({ state, onChange }: { state: AlphaFilterState; onChange: (next: AlphaFilterState) => void }) {
  const set = <K extends keyof AlphaFilterState>(key: K, value: AlphaFilterState[K]) => onChange({ ...state, [key]: value });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <FilterLabel>Length (chars)</FilterLabel>
        <div className="flex gap-2">
          <input
            value={state.lengthMin}
            onChange={(e) => set("lengthMin", e.target.value)}
            placeholder="Min"
            aria-label="Minimum name length"
            inputMode="numeric"
            className={FILTER_INPUT_CLASS}
          />
          <input
            value={state.lengthMax}
            onChange={(e) => set("lengthMax", e.target.value)}
            placeholder="Max"
            aria-label="Maximum name length"
            inputMode="numeric"
            className={FILTER_INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <FilterLabel>Starts with</FilterLabel>
        <input
          value={state.startsWith}
          onChange={(e) => set("startsWith", e.target.value)}
          placeholder="e.g. sun"
          aria-label="Name starts with"
          className={FILTER_INPUT_CLASS}
        />
      </div>

      <div>
        <FilterLabel>Ends with</FilterLabel>
        <input
          value={state.endsWith}
          onChange={(e) => set("endsWith", e.target.value)}
          placeholder="e.g. dao"
          aria-label="Name ends with"
          className={FILTER_INPUT_CLASS}
        />
      </div>

      <FilterSummary chips={alphaFilterSummary(state)} onClear={() => onChange(EMPTY_ALPHA_FILTERS)} />
    </div>
  );
}

/// Real registered names on ENS Labs' own ENSv2 alpha Sepolia deployment. Deliberately
/// simple compared to EnsV1Table: this alpha has no price/seller/order concept, just a
/// registered label + tokenId, so length/pattern (AlphaFilterState) are the only filters
/// that apply — filtered client-side since the full list is already in hand from the event
/// scan, not paginated server-side like Grails.
/// Pagination here is a client-side slice, not a paginated API call like Grails —
/// the full list is already in hand from the event scan (useEnsV2AlphaRegisteredNames),
/// so "next page" just moves the slice window rather than fetching anything new.
function EnsV2AlphaTable({
  names,
  isLoading,
  isError,
  retry,
  filters,
  onClearFilters,
}: {
  names: EnsV2AlphaName[];
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  filters: AlphaFilterState;
  onClearFilters: () => void;
}) {
  const filteredNames = useMemo(() => names.filter((n) => matchesAlphaFilters(n, filters)), [names, filters]);
  const [page, setPage] = useState(1);
  // Page 2 of a filter set that no longer applies means nothing.
  useEffect(() => {
    setPage(1);
  }, [filters.lengthMin, filters.lengthMax, filters.startsWith, filters.endsWith]);
  const totalPages = Math.max(1, Math.ceil(filteredNames.length / ENSV2_ALPHA_PAGE_SIZE));
  // Clamps down if the list shrinks (a page reload with fewer results) rather than
  // stranding the view on a now-nonexistent page with nothing to show.
  const clampedPage = Math.min(page, totalPages);
  const pageNames = filteredNames.slice((clampedPage - 1) * ENSV2_ALPHA_PAGE_SIZE, clampedPage * ENSV2_ALPHA_PAGE_SIZE);

  return (
    <>
      <ScrollHint className="no-scrollbar" arrowAlign="top">
        <div
          className="min-w-[480px] transition-opacity duration-150"
          style={{ opacity: isLoading && filteredNames.length > 0 ? 0.5 : 1 }}
        >
          <TableHeader columns={ENSV2_ALPHA_COLUMNS} labels={["Name", ""]} />

          {pageNames.map(({ tokenId, label }) => (
            <Link
              key={tokenId.toString()}
              href={`/domains/ensv2-alpha/${encodeURIComponent(label)}`}
              className={`explore-row grid ${ENSV2_ALPHA_COLUMNS} items-center border-b py-3.5 ${GUTTER_RIGHT}`}
              style={{ borderColor: "var(--line)" }}
            >
              <div
                className={`explore-row-sticky sticky left-0 z-10 flex min-w-0 items-center gap-3.5 self-stretch ${GUTTER_LEFT} ${NAME_CELL_GUTTER}`}
              >
                <NameCard canonicalId={tokenId} />
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-sans text-base font-semibold" style={{ color: "var(--fg)" }} title={label}>
                    {label}
                  </span>
                  {/* These live on ENS Labs' Sepolia alpha deployment, not mainnet. */}
                  <span className="shrink-0">
                    <StatusBadge variant="chain">Sepolia</StatusBadge>
                  </span>
                </div>
              </div>
              <div className="justify-self-end">
                <span className={ACTION_PILL}>View</span>
              </div>
            </Link>
          ))}
        </div>
      </ScrollHint>

      {isError && (
        <TableMessage>
          <p style={{ color: "var(--accent)" }}>Couldn&apos;t load registrations.</p>
          <button onClick={retry} className={PAGER_BUTTON}>
            Retry
          </button>
        </TableMessage>
      )}
      {!isError && isLoading && names.length === 0 && (
        <TableMessage>
          <Spinner />
          <p style={{ color: "var(--fg-dim)" }}>Loading registrations…</p>
        </TableMessage>
      )}
      {!isError && !isLoading && names.length === 0 && (
        <TableMessage>
          <p style={{ color: "var(--fg-dim)" }}>No names registered on this alpha deployment yet — be the first.</p>
        </TableMessage>
      )}
      {/* Nothing registered at all and nothing matching the filters are different problems,
          so they read differently — and only the second one has a way out. */}
      {!isError && !isLoading && names.length > 0 && filteredNames.length === 0 && (
        <TableMessage>
          <p style={{ color: "var(--fg-dim)" }}>No names match these filters.</p>
          <button onClick={onClearFilters} className={PAGER_BUTTON}>
            Clear filters
          </button>
        </TableMessage>
      )}

      {!isError && filteredNames.length > ENSV2_ALPHA_PAGE_SIZE && (
        <Pager
          page={clampedPage}
          totalPages={totalPages}
          hasPrev={clampedPage > 1}
          hasNext={clampedPage < totalPages}
          isLoading={isLoading}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      )}
    </>
  );
}

function EnsV1Table({
  listings,
  isLoading,
  isError,
  retry,
  activeFilterCount,
  onClearFilters,
  page,
  totalPages,
  hasNext,
  onPrev,
  onNext,
}: {
  listings: EnsV1Listing[];
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  page: number;
  totalPages: number | null;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <ScrollHint className="no-scrollbar" arrowAlign="top">
        {/* min-width covers the columns' own minimums plus both gutters, so the row grids
            never overflow this wrapper and the scroll hint's fade lands in the right place. */}
        <div className="min-w-[760px] transition-opacity duration-150" style={{ opacity: isLoading && listings.length > 0 ? 0.5 : 1 }}>
          <TableHeader columns={ENSV1_COLUMNS} labels={["Name", "Price", "Seller", ""]} />

          {listings.map((l) => (
            <EnsV1Row key={l.listing.order_hash} listing={l} />
          ))}
        </div>
      </ScrollHint>

      {isError && (
        <TableMessage>
          <p style={{ color: "var(--accent)" }}>Couldn&apos;t load listings.</p>
          <button onClick={retry} className={PAGER_BUTTON}>
            Retry
          </button>
        </TableMessage>
      )}
      {!isError && isLoading && listings.length === 0 && (
        <TableMessage>
          <Spinner />
          <p style={{ color: "var(--fg-dim)" }}>Loading listings…</p>
        </TableMessage>
      )}
      {/* "No listings match these filters", not "none on this page" — filtering is entirely
          server-side, so an empty result really is empty, not just empty here. The way out
          sits next to the message, since on a narrow viewport the sidebar's own Clear all is
          shut inside a collapsed drawer. */}
      {!isError && !isLoading && listings.length === 0 && (
        <TableMessage>
          <p style={{ color: "var(--fg-dim)" }}>
            {activeFilterCount > 0 ? "No listings match these filters." : "No listings yet."}
          </p>
          {activeFilterCount > 0 && (
            <button onClick={onClearFilters} className={PAGER_BUTTON}>
              Clear filters
            </button>
          )}
        </TableMessage>
      )}

      {/* Hidden on a single page of results — a pair of permanently dead arrows under a
          short list reads as something being broken. An exact page count, not "~N": it
          comes from the same filtered query that produced these rows. */}
      {!isError && (page > 1 || hasNext) && (
        <Pager
          page={page}
          totalPages={totalPages}
          hasPrev={page > 1}
          hasNext={hasNext}
          isLoading={isLoading}
          onPrev={onPrev}
          onNext={onNext}
        />
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
  const offer = listing.listing.protocol_data.parameters.offer[0];
  const rawPrice = BigInt(listing.price.value);
  // Shown trimmed, with the exact figure a hover away — an 18-decimal price rendered in
  // full makes a column of them impossible to compare.
  const price = formatTokenAmount(rawPrice, listing.price.decimals);
  const exactPrice = `${formatUnits(rawPrice, listing.price.decimals)} ${listing.price.currency}`;
  const displayName = listing.name ?? `Unnamed · #${shortId(offer.identifierOrCriteria)}`;

  const rowContent = (
    <>
      <div
        className={`explore-row-sticky sticky left-0 z-10 flex min-w-0 items-center gap-3.5 self-stretch ${GUTTER_LEFT} ${NAME_CELL_GUTTER}`}
      >
        <NameCard canonicalId={BigInt(offer.identifierOrCriteria)} />
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="truncate font-sans text-base font-semibold"
            style={{ color: listing.name ? "var(--fg)" : "var(--fg-muted)" }}
            title={listing.name ?? offer.identifierOrCriteria}
          >
            {displayName}
          </span>
          <span className="shrink-0">
            <StatusBadge variant="chain">L1</StatusBadge>
          </span>
        </div>
      </div>
      <div className="font-mono text-[15px] font-medium tabular-nums" style={{ color: "var(--fg)" }} title={exactPrice}>
        {price} <span style={{ color: "var(--fg-dim)" }}>{listing.price.currency}</span>
      </div>
      <div className="min-w-0">
        <span className="seller-pill inline-flex max-w-full items-center gap-2 rounded-full py-1 pr-3 pl-1">
          {/* Keyed off the address so two sellers in a row are told apart at a glance;
              a single flat swatch on every row was just decoration. */}
          <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: gradientFor(BigInt(seller)) }} />
          {/* An ENS name has no length limit, unlike the 13 chars shortAddr always
              produced — without this the pill outgrows its grid column. */}
          <span className="min-w-0 truncate font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
            <AddressLabel address={seller} />
          </span>
        </span>
      </div>
      <div className="justify-self-end">
        <span className={ACTION_PILL}>{listing.name ? "View" : "OpenSea ↗"}</span>
      </div>
    </>
  );

  const rowClassName = `explore-row grid ${ENSV1_COLUMNS} items-center border-b py-3.5 ${GUTTER_RIGHT}`;
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

