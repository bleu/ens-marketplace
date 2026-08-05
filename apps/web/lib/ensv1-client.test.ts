import { describe, expect, it } from "vitest";

import { grailsSearchParams } from "./ensv1-client";

/// The hook around this is thin (fetch, setState) and covered end-to-end by
/// cypress/e2e/ensv1-explore.cy.ts. What's worth testing in isolation is the translation
/// from sidebar state to query string, because that's the contract with apps/api's
/// GrailsController and the place a filter goes silently missing.

describe("grailsSearchParams", () => {
  it("asks for page 1 and nothing else when no filter is set", () => {
    expect(grailsSearchParams({}, 1)).toBe("page=1");
  });

  it("sends the length chips as one comma-separated list", () => {
    expect(grailsSearchParams({ lengths: [3, 4] }, 1)).toBe("lengths=3%2C4&page=1");
  });

  it("sends the open-ended chip separately from the exact lengths", () => {
    const params = new URLSearchParams(grailsSearchParams({ lengths: [3], lengthAtLeast: 6 }, 1));
    expect(params.get("lengths")).toBe("3");
    expect(params.get("lengthAtLeast")).toBe("6");
  });

  it("carries the sort key and the text query", () => {
    const params = new URLSearchParams(grailsSearchParams({ sort: "price-desc", query: "vitalikk" }, 2));
    expect(params.get("sort")).toBe("price-desc");
    expect(params.get("q")).toBe("vitalikk");
    expect(params.get("page")).toBe("2");
  });

  // The band is on by default, so the param only appears when the user turns it off —
  // and apps/api reads it as a literal "true" (see GrailsController).
  it("only sends includeOutliers when the sanity band is switched off", () => {
    expect(new URLSearchParams(grailsSearchParams({}, 1)).has("includeOutliers")).toBe(false);
    expect(new URLSearchParams(grailsSearchParams({ includeOutliers: true }, 1)).get("includeOutliers")).toBe("true");
  });

  it("omits empty strings and empty chip lists rather than sending blank params", () => {
    const params = new URLSearchParams(grailsSearchParams({ query: "", minPrice: "", lengths: [] }, 1));
    expect(params.has("q")).toBe(false);
    expect(params.has("minPrice")).toBe(false);
    expect(params.has("lengths")).toBe(false);
  });
});
