/// ENSv1 (real mainnet) Explore coverage — stubs our own /api/ensv1/* proxy routes via
/// cy.intercept rather than hitting the real backend, so these tests are deterministic and
/// don't depend on a scraped database being present.
///
/// These specs assert the outgoing query params and the rendering, not which rows a filter
/// picks: filtering is entirely server-side now, so a stub that reimplemented it would only be
/// testing the stub. See docs/explore-filters.md.

function listing(name: string, priceEth: string, index: number) {
  const wei = (Number(priceEth) * 1e18).toLocaleString("fullwide", { useGrouping: false });
  return {
    name,
    price: { value: wei, decimals: 18, currency: "ETH" },
    listing: {
      order_hash: `0x${String(index + 1).repeat(2).padStart(64, "0")}`,
      protocol_address: "0x0000000000000068F116a894984e2DB1123eB395",
      protocol_data: {
        parameters: {
          offerer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          offer: [{ token: "0x0635513f179d50a207757e05759cbd106d7dfce8", identifierOrCriteria: String(index + 1), itemType: 2 }],
        },
        signature: "0xdeadbeef",
      },
      price: { current: { value: wei, decimals: 18, currency: "ETH" } },
    },
    source: "grails",
  };
}

const NAMES = ["cyfixture1.eth", "cyfixture2.eth"];

function stubFeed(total = NAMES.length) {
  cy.intercept("GET", "/api/ensv1/grails-listings*", (req) => {
    req.reply({
      listings: NAMES.map((name, i) => listing(name, String(i + 1), i)),
      unresolvedCount: 0,
      next: null,
      total,
      totalPages: 1,
    });
  }).as("feed");
}

/// Every request the page has made so far, as parsed query params — the sidebar refetches on
/// each change, so assertions target the most recent one.
function lastQuery(): Cypress.Chainable<URLSearchParams> {
  return cy.get("@feed.all").then((calls) => {
    const interceptions = calls as unknown as { request: { url: string } }[];
    return new URLSearchParams(new URL(interceptions[interceptions.length - 1].request.url).search);
  });
}

describe("ENSv1 Explore", () => {
  beforeEach(() => {
    stubFeed();
    cy.visit("/domains");
    cy.wait("@feed");
  });

  it("shows the Grails feed", () => {
    cy.contains("Listings");
    cy.contains("cyfixture1.eth");
    cy.contains("cyfixture2.eth");
  });

  // The universe/mode picker is the chain selector in the top nav — mode follows the connected
  // chain, so a second copy of it in the filter sidebar was three no-op buttons.
  it("has no source or mode picker in the filters", () => {
    cy.contains("button", "OpenSea").should("not.exist");
    cy.contains("button", "Grails").should("not.exist");
    cy.contains("button", "ENSv1").should("not.exist");
  });

  it("never fetches the OpenSea browse feed", () => {
    cy.intercept("GET", "/api/ensv1/listings*", cy.spy().as("openseaFeed"));
    cy.visit("/domains");
    cy.wait("@feed");
    cy.get("@openseaFeed").should("not.have.been.called");
  });

  // Locale-agnostic: toLocaleString()'s grouping separator depends on the runtime's default
  // locale (e.g. "9,199" vs "9.199"), so match the digits loosely rather than a separator.
  it("shows the real filtered total, not a per-page count", () => {
    stubFeed(9199);
    cy.visit("/domains");
    cy.wait("@feed");
    cy.contains(/9.199 listings/);
    cy.contains("on this page").should("not.exist");
  });

  // The exact figure is still reachable through the cell's title attribute; what must not
  // survive is a column of prices no two of which line up.
  it("trims a long price instead of printing every decimal", () => {
    cy.intercept("GET", "/api/ensv1/grails-listings*", {
      body: { listings: [listing("dusty.eth", "0.043912830000000001", 0)], unresolvedCount: 0, next: null, total: 1, totalPages: 1 },
    }).as("feed");
    cy.visit("/domains");
    cy.wait("@feed");
    cy.contains("0.04391283").should("not.exist");
    cy.contains("0.0439").should("be.visible");
  });

  it("asks the server for a price ceiling rather than filtering in the browser", () => {
    cy.get("input[aria-label='Maximum price in ETH']").type("5");
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("maxPrice")).to.equal("5");
    });
  });

  it("asks the server for a name prefix", () => {
    cy.get("input[aria-label='Name starts with']").type("sun");
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("startsWith")).to.equal("sun");
    });
  });

  it("puts the active filters in the URL so a view can be shared", () => {
    cy.get("input[aria-label='Minimum price in ETH']").type("0.5");
    cy.wait("@feed");
    cy.location("search").should((search) => {
      expect(new URLSearchParams(search).get("priceMin")).to.equal("0.5");
    });
  });

  it("restores the filters from a shared URL", () => {
    cy.visit("/domains?priceMin=0.5&lengthMax=4");
    cy.wait("@feed");
    cy.get("input[aria-label='Minimum price in ETH']").should("have.value", "0.5");
    cy.get("input[aria-label='Maximum name length']").should("have.value", "4");
    lastQuery().should((q) => {
      expect(q.get("minPrice")).to.equal("0.5");
      expect(q.get("maxLength")).to.equal("4");
    });
  });

  it("summarises the active filters and clears them all at once", () => {
    cy.get("input[aria-label='Maximum price in ETH']").type("5");
    cy.wait("@feed");
    cy.contains("up to 5 ETH").should("be.visible");
    cy.contains("button", "Clear all").click();
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("maxPrice")).to.equal(null);
    });
    cy.location("search").should("not.contain", "priceMax");
  });
});

describe("ENSv1 Explore filters on a narrow viewport", () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    stubFeed();
    cy.visit("/domains");
    cy.wait("@feed");
  });

  it("keeps the filters in a drawer so the table stays above the fold", () => {
    cy.get("input[aria-label='Maximum price in ETH']").should("not.be.visible");
    cy.contains("button", "Show").click();
    cy.get("input[aria-label='Maximum price in ETH']").should("be.visible");
    cy.contains("button", "Hide").click();
    cy.get("input[aria-label='Maximum price in ETH']").should("not.be.visible");
  });
});
