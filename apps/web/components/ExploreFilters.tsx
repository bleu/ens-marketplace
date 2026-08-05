"use client";

import { useState } from "react";
import type { GrailsFilters, GrailsLengthCounts, GrailsSortKey } from "@/lib/ensv1-client";

/// The sidebar for the ENSv1 feed. Every control here maps to a server-side filter (see
/// apps/api's GrailsService) — nothing is filtered in the browser, so what the chips claim
/// and what paging through actually yields are the same set.

/// The chips, in display order. `atLeast` marks the one open-ended chip: it matches its
/// length or longer, so the group can't collapse to a single list of exact lengths.
export const LENGTH_CHIPS = [
  { key: "3", length: 3, atLeast: false, summary: "3 characters" },
  { key: "4", length: 4, atLeast: false, summary: "4 characters" },
  { key: "5", length: 5, atLeast: false, summary: "5 characters" },
  { key: "6+", length: 6, atLeast: true, summary: "6+ characters" },
] as const;

export type LengthChipKey = (typeof LENGTH_CHIPS)[number]["key"];

const SORT_OPTIONS: { value: GrailsSortKey; label: string }[] = [
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
  { value: "length-asc", label: "Length ↑" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "recent", label: "Recently listed" },
];

/// What the sidebar owns. Text inputs are debounced by the page before they reach the query
/// (see the Explore page), so this is the immediate, visible state.
export interface ExploreFilterState {
  query: string;
  chips: LengthChipKey[];
  sort: GrailsSortKey;
  includeOutliers: boolean;
  priceMin: string;
  priceMax: string;
  lengthMin: string;
  lengthMax: string;
  startsWith: string;
  endsWith: string;
}

export const EMPTY_FILTERS: ExploreFilterState = {
  query: "",
  chips: [],
  sort: "price-asc",
  includeOutliers: false,
  priceMin: "",
  priceMax: "",
  lengthMin: "",
  lengthMax: "",
  startsWith: "",
  endsWith: "",
};

/// One line per active filter, for the summary above the chips. Sort is excluded on purpose
/// — it's always set to something, so listing it would make "clear all" look permanently
/// available when there's nothing to clear.
export function activeFilterSummary(state: ExploreFilterState): string[] {
  const parts: string[] = [];
  if (state.query) parts.push(`“${state.query}”`);
  for (const chip of LENGTH_CHIPS) {
    if (state.chips.includes(chip.key)) parts.push(chip.summary);
  }
  if (state.priceMin) parts.push(`from ${state.priceMin} ETH`);
  if (state.priceMax) parts.push(`up to ${state.priceMax} ETH`);
  if (state.lengthMin) parts.push(`${state.lengthMin}+ chars`);
  if (state.lengthMax) parts.push(`${state.lengthMax} chars or fewer`);
  if (state.startsWith) parts.push(`starts “${state.startsWith}”`);
  if (state.endsWith) parts.push(`ends “${state.endsWith}”`);
  if (state.includeOutliers) parts.push("outliers included");
  return parts;
}

/// The sidebar state as a query string, and back. This is what makes a filtered view
/// shareable, so it's a real round-trip: anything the URL can't express would silently
/// disappear when a link is opened. Defaults are omitted so a plain /domains link stays
/// clean, and anything unrecognised (a hand-edited URL, a sort we've since renamed) falls
/// back to the default rather than erroring.
export function exploreFiltersToQuery(state: ExploreFilterState): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.chips.length > 0) {
    // Ordered by the chip list, not by click order, so two people arriving at the same
    // selection get the same link.
    params.set("lengths", LENGTH_CHIPS.filter((chip) => state.chips.includes(chip.key)).map((chip) => chip.key).join(","));
  }
  if (state.sort !== EMPTY_FILTERS.sort) params.set("sort", state.sort);
  if (state.includeOutliers) params.set("includeOutliers", "true");
  if (state.priceMin) params.set("priceMin", state.priceMin);
  if (state.priceMax) params.set("priceMax", state.priceMax);
  if (state.lengthMin) params.set("lengthMin", state.lengthMin);
  if (state.lengthMax) params.set("lengthMax", state.lengthMax);
  if (state.startsWith) params.set("startsWith", state.startsWith);
  if (state.endsWith) params.set("endsWith", state.endsWith);
  return params.toString();
}

export function exploreFiltersFromQuery(params: URLSearchParams): ExploreFilterState {
  const chipKeys = (params.get("lengths") ?? "").split(",");
  const sort = SORT_OPTIONS.find((option) => option.value === params.get("sort"))?.value;
  return {
    query: params.get("q") ?? "",
    chips: LENGTH_CHIPS.filter((chip) => chipKeys.includes(chip.key)).map((chip) => chip.key),
    sort: sort ?? EMPTY_FILTERS.sort,
    includeOutliers: params.get("includeOutliers") === "true",
    priceMin: params.get("priceMin") ?? "",
    priceMax: params.get("priceMax") ?? "",
    lengthMin: params.get("lengthMin") ?? "",
    lengthMax: params.get("lengthMax") ?? "",
    startsWith: params.get("startsWith") ?? "",
    endsWith: params.get("endsWith") ?? "",
  };
}

/// Sidebar state to the shape the data hook takes. The one piece of real translation is the
/// length group: exact-length chips become a list, and the open-ended chip becomes a
/// minimum, because the server has to OR a list against a range rather than just widen the
/// list (see apps/api's lengthChipGroup).
export function toGrailsFilters(state: ExploreFilterState): GrailsFilters {
  const selected = LENGTH_CHIPS.filter((chip) => state.chips.includes(chip.key));
  const exact = selected.filter((chip) => !chip.atLeast).map((chip) => chip.length);
  const openEnded = selected.find((chip) => chip.atLeast);
  return {
    query: state.query,
    lengths: exact.length > 0 ? exact : undefined,
    lengthAtLeast: openEnded?.length,
    sort: state.sort,
    includeOutliers: state.includeOutliers,
    minPrice: state.priceMin,
    maxPrice: state.priceMax,
    minLength: state.lengthMin,
    maxLength: state.lengthMax,
    startsWith: state.startsWith,
    endsWith: state.endsWith,
  };
}

const INPUT_CLASS = "input-field h-9 w-full rounded-[6px] border px-2.5 font-mono text-xs outline-none";
const INPUT_STYLE = { borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" };

export function ExploreFilters({
  state,
  onChange,
  lengthCounts,
}: {
  state: ExploreFilterState;
  onChange: (next: ExploreFilterState) => void;
  lengthCounts: GrailsLengthCounts | null;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const summary = activeFilterSummary(state);

  const set = <K extends keyof ExploreFilterState>(key: K, value: ExploreFilterState[K]) => onChange({ ...state, [key]: value });

  const toggleChip = (key: LengthChipKey) =>
    set("chips", state.chips.includes(key) ? state.chips.filter((c) => c !== key) : [...state.chips, key]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label htmlFor="explore-search" className="mb-1.5 block font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
          Search
        </label>
        <input
          id="explore-search"
          value={state.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="e.g. vitalik"
          aria-label="Search listed names"
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        />
        {/* Says what the box does, because a typo silently "working" is otherwise
            indistinguishable from a filter that ignored the input. */}
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
          Matches anywhere in the name, and tolerates typos.
        </p>
      </div>

      <div>
        <div className="mb-2 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--fg-kicker)" }}>
          Length
        </div>
        <div className="flex flex-wrap gap-2">
          {LENGTH_CHIPS.map((chip) => {
            const selected = state.chips.includes(chip.key);
            const count = lengthCounts?.[chip.key] ?? null;
            // A chip that would return nothing is disabled rather than hidden — the group
            // keeps its shape as filters change, and the zero is the useful information.
            const empty = count === 0;
            return (
              <button
                key={chip.key}
                type="button"
                // The visible label is just "4", which also appears inside the neighbouring
                // chips' counts — the aria-label gives both screen readers and tests an
                // unambiguous handle.
                aria-label={chip.summary}
                aria-pressed={selected}
                disabled={empty}
                onClick={() => toggleChip(chip.key)}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-sans text-[13px] font-medium disabled:opacity-40"
                style={
                  selected
                    ? { borderColor: "var(--brand)", background: "rgba(var(--brand-rgb),0.08)", color: "var(--fg)" }
                    : { borderColor: "var(--line)", color: "var(--fg-muted)" }
                }
              >
                {chip.key}
                {count !== null && (
                  <span className="font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="explore-sort" className="mb-1.5 block font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
          Sort
        </label>
        <select
          id="explore-sort"
          aria-label="Sort listings"
          value={state.sort}
          onChange={(e) => set("sort", e.target.value as GrailsSortKey)}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={state.includeOutliers}
          onChange={(e) => set("includeOutliers", e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
            Include outliers
          </span>
          <span className="mt-0.5 block font-mono text-[10px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
            Dust and absurdly-priced listings are hidden by default.
          </span>
        </span>
      </label>

      {summary.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <div className="font-mono text-[11px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            {summary.join(" · ")}
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, sort: state.sort })}
            className="self-start font-sans text-xs font-medium underline"
            style={{ color: "var(--fg-muted)" }}
          >
            Clear all
          </button>
        </div>
      )}

      <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase"
          style={{ color: "var(--fg-kicker)" }}
        >
          Advanced
          <span aria-hidden>{advancedOpen ? "−" : "+"}</span>
        </button>

        {advancedOpen && (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <div className="mb-1.5 font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                Price (ETH)
              </div>
              <div className="flex gap-2">
                <input
                  value={state.priceMin}
                  onChange={(e) => set("priceMin", e.target.value)}
                  placeholder="Min"
                  aria-label="Minimum price in ETH"
                  inputMode="decimal"
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
                <input
                  value={state.priceMax}
                  onChange={(e) => set("priceMax", e.target.value)}
                  placeholder="Max"
                  aria-label="Maximum price in ETH"
                  inputMode="decimal"
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                Length (chars)
              </div>
              <div className="flex gap-2">
                <input
                  value={state.lengthMin}
                  onChange={(e) => set("lengthMin", e.target.value)}
                  placeholder="Min"
                  aria-label="Minimum name length"
                  inputMode="numeric"
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
                <input
                  value={state.lengthMax}
                  onChange={(e) => set("lengthMax", e.target.value)}
                  placeholder="Max"
                  aria-label="Maximum name length"
                  inputMode="numeric"
                  className={INPUT_CLASS}
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                Starts with
              </div>
              <input
                value={state.startsWith}
                onChange={(e) => set("startsWith", e.target.value)}
                placeholder="e.g. sun"
                aria-label="Name starts with"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </div>

            <div>
              <div className="mb-1.5 font-sans text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                Ends with
              </div>
              <input
                value={state.endsWith}
                onChange={(e) => set("endsWith", e.target.value)}
                placeholder="e.g. dao"
                aria-label="Name ends with"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
