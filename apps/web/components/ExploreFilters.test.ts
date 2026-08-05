import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  activeFilterSummary,
  exploreFiltersFromQuery,
  exploreFiltersToQuery,
  type ExploreFilterState,
} from "./ExploreFilters";

/// The URL is the shareable form of the sidebar, so what matters is that a link round-trips to
/// the same visible state — a filter the URL can't express would silently vanish when someone
/// opened the link.

describe("explore filter URL round-trip", () => {
  it("puts nothing in the URL for an untouched sidebar", () => {
    expect(exploreFiltersToQuery(EMPTY_FILTERS)).toBe("");
  });

  it("round-trips every filter", () => {
    const state: ExploreFilterState = {
      priceMin: "0.5",
      priceMax: "10",
      lengthMin: "3",
      lengthMax: "8",
      startsWith: "sun",
      endsWith: "dao",
    };

    expect(exploreFiltersFromQuery(new URLSearchParams(exploreFiltersToQuery(state)))).toEqual(state);
  });

  // `page` shares the query string with the filters but isn't one of them — it's owned by the
  // page, and reading it in here would make it survive a Clear all.
  it("ignores params it doesn't own", () => {
    expect(exploreFiltersFromQuery(new URLSearchParams("page=3"))).toEqual(EMPTY_FILTERS);
  });
});

describe("activeFilterSummary", () => {
  it("has nothing to summarise for an untouched sidebar", () => {
    expect(activeFilterSummary(EMPTY_FILTERS)).toEqual([]);
  });

  it("names each active filter", () => {
    expect(activeFilterSummary({ ...EMPTY_FILTERS, priceMax: "5", startsWith: "sun" })).toEqual([
      "up to 5 ETH",
      "starts “sun”",
    ]);
  });
});
