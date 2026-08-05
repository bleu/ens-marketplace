import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  activeFilterSummary,
  exploreFiltersFromQuery,
  exploreFiltersToQuery,
  toGrailsFilters,
  type ExploreFilterState,
} from "./ExploreFilters";

/// The URL is the shareable form of the sidebar, so what matters is that a link round-trips
/// to the same visible state — and that the "6+" chip, which is a range rather than an exact
/// length, survives the trip.

describe("explore filter URL round-trip", () => {
  it("puts nothing in the URL for an untouched sidebar", () => {
    expect(exploreFiltersToQuery(EMPTY_FILTERS)).toBe("");
  });

  it("round-trips chips, sort and query", () => {
    const state: ExploreFilterState = { ...EMPTY_FILTERS, chips: ["3", "6+"], sort: "recent", query: "vitalik" };

    const restored = exploreFiltersFromQuery(new URLSearchParams(exploreFiltersToQuery(state)));

    expect(restored).toEqual(state);
  });

  it("round-trips the advanced ranges and the outlier toggle", () => {
    const state: ExploreFilterState = {
      ...EMPTY_FILTERS,
      priceMin: "0.5",
      priceMax: "10",
      lengthMin: "3",
      lengthMax: "8",
      startsWith: "sun",
      endsWith: "dao",
      includeOutliers: true,
    };

    expect(exploreFiltersFromQuery(new URLSearchParams(exploreFiltersToQuery(state)))).toEqual(state);
  });

  it("ignores an unknown chip or sort in a hand-edited URL rather than breaking", () => {
    const restored = exploreFiltersFromQuery(new URLSearchParams("lengths=3,99&sort=by-vibes"));

    expect(restored.chips).toEqual(["3"]);
    expect(restored.sort).toBe("price-asc");
  });
});

describe("toGrailsFilters", () => {
  it("splits the open-ended chip out of the exact lengths", () => {
    const filters = toGrailsFilters({ ...EMPTY_FILTERS, chips: ["3", "4", "6+"] });

    expect(filters.lengths).toEqual([3, 4]);
    expect(filters.lengthAtLeast).toBe(6);
  });

  it("leaves lengthAtLeast unset when the open-ended chip isn't selected", () => {
    const filters = toGrailsFilters({ ...EMPTY_FILTERS, chips: ["5"] });

    expect(filters.lengths).toEqual([5]);
    expect(filters.lengthAtLeast).toBeUndefined();
  });
});

describe("activeFilterSummary", () => {
  it("has nothing to summarise for an untouched sidebar", () => {
    expect(activeFilterSummary(EMPTY_FILTERS)).toEqual([]);
  });

  // Sort always holds a value, so counting it as "active" would leave Clear all permanently
  // offering to clear nothing.
  it("doesn't count the sort order as an active filter", () => {
    expect(activeFilterSummary({ ...EMPTY_FILTERS, sort: "name-asc" })).toEqual([]);
  });

  it("names each selected chip", () => {
    expect(activeFilterSummary({ ...EMPTY_FILTERS, chips: ["4"] })).toEqual(["4 characters"]);
  });
});
