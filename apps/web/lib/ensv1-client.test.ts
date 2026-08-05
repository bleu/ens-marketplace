import { describe, expect, it } from "vitest";

import { grailsSearchParams } from "./ensv1-client";

/// The hook around this is thin (fetch, setState) and covered end-to-end by
/// cypress/e2e/ensv1-explore.cy.ts. What's worth testing in isolation is the translation from
/// sidebar state to query string, because that's the contract with apps/api's GrailsController
/// and the place a filter goes silently missing.

describe("grailsSearchParams", () => {
  it("asks for page 1 and nothing else when no filter is set", () => {
    expect(grailsSearchParams({}, 1)).toBe("page=1");
  });

  it("carries every filter the feed supports", () => {
    const params = new URLSearchParams(
      grailsSearchParams(
        { minPrice: "0.5", maxPrice: "10", minLength: "3", maxLength: "8", startsWith: "sun", endsWith: "dao" },
        2,
      ),
    );

    expect(params.get("minPrice")).toBe("0.5");
    expect(params.get("maxPrice")).toBe("10");
    expect(params.get("minLength")).toBe("3");
    expect(params.get("maxLength")).toBe("8");
    expect(params.get("startsWith")).toBe("sun");
    expect(params.get("endsWith")).toBe("dao");
    expect(params.get("page")).toBe("2");
  });

  // An empty input is an input the user hasn't touched, not a filter for the empty string.
  it("omits empty strings rather than sending blank params", () => {
    const params = new URLSearchParams(grailsSearchParams({ minPrice: "", startsWith: "" }, 1));

    expect(params.has("minPrice")).toBe(false);
    expect(params.has("startsWith")).toBe(false);
  });
});
