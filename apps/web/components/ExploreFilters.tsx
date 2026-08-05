"use client";

import type { GrailsFilters } from "@/lib/ensv1-client";

/// The sidebar for the ENSv1 feed. Every control here maps to a server-side filter (see
/// apps/api's GrailsService) — nothing is filtered in the browser, so what the header claims
/// and what paging through actually yields are the same set.

/// What the sidebar owns. Text inputs are debounced by the page before they reach the query
/// (see the Explore page), so this is the immediate, visible state.
export interface ExploreFilterState {
  priceMin: string;
  priceMax: string;
  lengthMin: string;
  lengthMax: string;
  startsWith: string;
  endsWith: string;
}

export const EMPTY_FILTERS: ExploreFilterState = {
  priceMin: "",
  priceMax: "",
  lengthMin: "",
  lengthMax: "",
  startsWith: "",
  endsWith: "",
};

/// One phrase per active filter, for the summary above Clear all. Exists so a filtered view
/// says what it's filtered by — with six separate inputs it was otherwise possible to leave a
/// stray value in one and have no idea why the feed looked empty.
export function activeFilterSummary(state: ExploreFilterState): string[] {
  const parts: string[] = [];
  if (state.priceMin) parts.push(`from ${state.priceMin} ETH`);
  if (state.priceMax) parts.push(`up to ${state.priceMax} ETH`);
  if (state.lengthMin) parts.push(`${state.lengthMin}+ chars`);
  if (state.lengthMax) parts.push(`${state.lengthMax} chars or fewer`);
  if (state.startsWith) parts.push(`starts “${state.startsWith}”`);
  if (state.endsWith) parts.push(`ends “${state.endsWith}”`);
  return parts;
}

/// The sidebar state as a query string, and back. This is what makes a filtered view
/// shareable, so it's a real round-trip: anything the URL can't express would silently
/// disappear when a link is opened. Defaults are omitted so a plain /domains link stays clean.
export function exploreFiltersToQuery(state: ExploreFilterState): string {
  const params = new URLSearchParams();
  if (state.priceMin) params.set("priceMin", state.priceMin);
  if (state.priceMax) params.set("priceMax", state.priceMax);
  if (state.lengthMin) params.set("lengthMin", state.lengthMin);
  if (state.lengthMax) params.set("lengthMax", state.lengthMax);
  if (state.startsWith) params.set("startsWith", state.startsWith);
  if (state.endsWith) params.set("endsWith", state.endsWith);
  return params.toString();
}

export function exploreFiltersFromQuery(params: URLSearchParams): ExploreFilterState {
  return {
    priceMin: params.get("priceMin") ?? "",
    priceMax: params.get("priceMax") ?? "",
    lengthMin: params.get("lengthMin") ?? "",
    lengthMax: params.get("lengthMax") ?? "",
    startsWith: params.get("startsWith") ?? "",
    endsWith: params.get("endsWith") ?? "",
  };
}

/// Sidebar state to the shape the data hook takes. A straight rename today; it exists as its
/// own step because the URL's names and the API's names are separate contracts and shouldn't
/// have to move together.
export function toGrailsFilters(state: ExploreFilterState): GrailsFilters {
  return {
    minPrice: state.priceMin,
    maxPrice: state.priceMax,
    minLength: state.lengthMin,
    maxLength: state.lengthMax,
    startsWith: state.startsWith,
    endsWith: state.endsWith,
  };
}

/// Exported so the ENSv2 alpha sidebar (AlphaFilters, in the Explore page) dresses its own
/// controls identically — the two sidebars swap in and out of the same slot, so any drift
/// between them shows up as the panel changing shape when the chain changes.
export const FILTER_INPUT_CLASS =
  "input-field filter-input h-10 w-full min-w-0 rounded-[var(--radius-2)] border px-3 font-mono text-[13px] tabular-nums outline-none";

/// Same size and tracking as the table's column headers, so a label in the sidebar and a
/// label over a column read as the same kind of thing.
export function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[11px] tracking-[0.08em] uppercase" style={{ color: "var(--fg-dim)" }}>
      {children}
    </div>
  );
}

/// One chip per active filter plus the way out. Chips rather than a run-on sentence because
/// with several inputs feeding one feed, a stray value needs to be visible at a glance.
export function FilterSummary({ chips, onClear }: { chips: string[]; onClear: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-col items-start gap-3 border-t pt-5" style={{ borderColor: "var(--line)" }}>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full px-2.5 py-1 font-mono text-[11px] leading-[1.4]"
            style={{ background: "rgba(var(--brand-rgb),0.12)", color: "var(--brand)" }}
          >
            {chip}
          </span>
        ))}
      </div>
      <button type="button" onClick={onClear} className="btn-outline h-8 rounded-[var(--radius-2)] border px-3 font-sans text-xs font-medium">
        Clear all
      </button>
    </div>
  );
}

export function ExploreFilters({
  state,
  onChange,
}: {
  state: ExploreFilterState;
  onChange: (next: ExploreFilterState) => void;
}) {
  const summary = activeFilterSummary(state);
  const set = <K extends keyof ExploreFilterState>(key: K, value: ExploreFilterState[K]) => onChange({ ...state, [key]: value });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <FilterLabel>Price (ETH)</FilterLabel>
        <div className="flex gap-2">
          <input
            value={state.priceMin}
            onChange={(e) => set("priceMin", e.target.value)}
            placeholder="Min"
            aria-label="Minimum price in ETH"
            inputMode="decimal"
            className={FILTER_INPUT_CLASS}
          />
          <input
            value={state.priceMax}
            onChange={(e) => set("priceMax", e.target.value)}
            placeholder="Max"
            aria-label="Maximum price in ETH"
            inputMode="decimal"
            className={FILTER_INPUT_CLASS}
          />
        </div>
      </div>

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

      <FilterSummary chips={summary} onClear={() => onChange(EMPTY_FILTERS)} />
    </div>
  );
}
