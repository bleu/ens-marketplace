"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatUnits } from "viem";
import { useNetworkMode } from "@/lib/network-mode";
import { cacheListingForNavigation, useGrailsListings } from "@/lib/ensv1-client";
import {
  ExploreFilters,
  exploreFiltersFromQuery,
  exploreFiltersToQuery,
  toGrailsFilters,
  type ExploreFilterState,
} from "@/components/ExploreFilters";
import { openseaAssetUrl, type EnsV1Listing } from "@/lib/ensv1";
import { useEnsV2AlphaRegisteredNames, type EnsV2AlphaName } from "@/lib/ensv2-alpha";
import { AddressLabel } from "@/components/AddressLabel";
import { NameCard } from "@/components/NameCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ScrollHint } from "@/components/ScrollHint";
import { Spinner } from "@/components/Spinner";
import { shortId } from "@/lib/format";

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
    <Suspense fallback={<main className="p-4 font-mono text-sm text-[var(--fg-dim)] lg:p-8">Loading…</main>}>
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

  return (
    <main className="animate-[fadeIn_0.2s_var(--ease-out)]">
      <div className="flex h-[60px] items-center gap-2 border-b px-4 lg:px-8" style={{ borderColor: "var(--line)" }}>
        {networkMode === "ensv1" && (
          <>
            <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
              Listings
            </span>
            {/* A real count of the filtered set, not of this page — every filter is applied
                server-side, so this is the number of rows the user can actually reach. */}
            <span className="ml-auto shrink-0 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
              {grails.total !== null && <>{grails.total.toLocaleString()} listings</>}
            </span>
          </>
        )}
        {networkMode === "ensv2-alpha" && (
          <>
            <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
              ENSv2 · Sepolia Alpha
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
              {alpha.names.length} registered
            </span>
            <Link
              href="/domains/ensv2-alpha/register"
              className="flex h-9 shrink-0 items-center rounded-[var(--radius-2)] px-4 font-sans text-xs font-semibold"
              style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
            >
              Register a name
            </Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 items-start lg:grid-cols-[280px_1fr]">
        {/* filters — on a narrow viewport these collapse into a drawer, so a tall filter
            column doesn't push the table below the fold. */}
        <aside className="border-b p-6 lg:sticky lg:top-[76px] lg:border-b-0 lg:border-r" style={{ borderColor: "var(--line)" }}>
          <div className="mb-5 flex items-center gap-2">
            <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
              Filters
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-expanded={drawerOpen}
              className="ml-auto h-8 rounded-[var(--radius-2)] border px-3 font-mono text-xs lg:hidden"
              style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
            >
              {drawerOpen ? "Hide" : "Filters"}
            </button>
          </div>

          <div className={drawerOpen ? "block" : "hidden lg:block"}>
            {networkMode === "ensv2-alpha" ? (
              <p className="font-mono text-[11px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                No filters yet.
              </p>
            ) : (
              <ExploreFilters state={filters} onChange={setFilters} />
            )}
          </div>
        </aside>

        {/* table */}
        <section className="px-4 pb-20 pt-6 lg:px-8">
          {networkMode === "ensv2-alpha" ? (
            <EnsV2AlphaTable names={alpha.names} isLoading={alpha.isLoading} isError={alpha.isError} retry={alpha.refetch} />
          ) : (
            <EnsV1Table
              listings={grails.listings}
              isLoading={grails.isLoading}
              isError={grails.isError}
              retry={grails.refetch}
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

const ENSV2_ALPHA_PAGE_SIZE = 20;

/// Real registered names on ENS Labs' own ENSv2 alpha Sepolia deployment — no filters yet
/// (see the sidebar note above this table). Deliberately simple compared to EnsV1Table:
/// this alpha has no price/seller/order concept, just a registered label + tokenId.
/// Pagination here is a client-side slice, not a paginated API call like Grails/OpenSea —
/// the full list is already in hand from the event scan (useEnsV2AlphaRegisteredNames),
/// so "next page" just moves the slice window rather than fetching anything new.
function EnsV2AlphaTable({
  names,
  isLoading,
  isError,
  retry,
}: {
  names: EnsV2AlphaName[];
  isLoading: boolean;
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
      <div className="min-w-[520px] transition-opacity duration-150" style={{ opacity: isLoading && names.length > 0 ? 0.5 : 1 }}>
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
              Couldn&apos;t load registrations.
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
        {!isError && isLoading && names.length === 0 && (
          <div className="flex items-center gap-2.5 py-8">
            <Spinner />
            <p className="font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading registrations…
            </p>
          </div>
        )}
        {!isError && !isLoading && names.length === 0 && (
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
                  <StatusBadge variant="chain">Mainnet</StatusBadge>
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
            disabled={clampedPage === 1 || isLoading}
            className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            ← Previous
          </button>
          <span className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
            {isLoading && <Spinner size={12} />}
            Page {clampedPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={clampedPage === totalPages || isLoading}
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
  listings,
  isLoading,
  isError,
  retry,
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
  page: number;
  totalPages: number | null;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
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

        {isError && (
          <div className="flex items-center gap-3 py-8">
            <p className="font-mono text-sm" style={{ color: "var(--accent)" }}>
              Couldn&apos;t load listings.
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
        {!isError && isLoading && listings.length === 0 && (
          <div className="flex items-center gap-2.5 py-8">
            <Spinner />
            <p className="font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading listings…
            </p>
          </div>
        )}
        {/* "No listings match these filters", not "none on this page" — filtering is entirely
            server-side, so an empty result really is empty, not just empty here. */}
        {!isError && !isLoading && listings.length === 0 && (
          <p className="py-8 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            No listings match these filters.
          </p>
        )}

        {listings.map((l) => (
          <EnsV1Row key={l.listing.order_hash} listing={l} />
        ))}
      </div>
      </ScrollHint>
      {!isError && (
        <div className="flex items-center justify-center gap-4 py-6">
          <button
            onClick={onPrev}
            disabled={page === 1 || isLoading}
            className="h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs disabled:opacity-40"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            ← Previous
          </button>
          {/* An exact page count, not "~N" — the count comes from the same filtered query
              that produced these rows. */}
          <span className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
            {isLoading && <Spinner size={12} />}
            Page {page}
            {totalPages !== null && <> of {totalPages.toLocaleString()}</>}
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

