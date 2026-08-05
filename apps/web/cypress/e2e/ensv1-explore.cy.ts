/// ENSv1 (real mainnet) Explore coverage — stubs our own /api/ensv1/* proxy routes via
/// cy.intercept rather than hitting the real backend, so these tests are deterministic and
/// don't depend on a scraped database being present.
///
/// The split of responsibility is deliberate. That a filter actually selects the right rows
/// is proved against a real Postgres in apps/api/src/grails/grails.service.spec.ts. What's
/// left to prove here is that the sidebar asks for the right thing and renders what comes
/// back — so these specs assert on the outgoing query params and the DOM, and the stub
/// replies with a fixed set rather than reimplementing the filtering.

interface StubOptions {
  total?: number;
  lengthCounts?: Record<string, number>;
  names?: string[];
}

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

const DEFAULT_NAMES = ["cyfixture1.eth", "cyfixture2.eth"];

function stubFeed(options: StubOptions = {}) {
  const names = options.names ?? DEFAULT_NAMES;
  cy.intercept("GET", "/api/ensv1/grails-listings*", (req) => {
    req.reply({
      listings: names.map((name, i) => listing(name, String(i + 1), i)),
      unresolvedCount: 0,
      next: null,
      total: options.total ?? names.length,
      totalPages: 1,
      lengthCounts: options.lengthCounts ?? { "3": 12, "4": 340, "5": 900, "6+": 4000 },
    });
  }).as("feed");
}

/// Chips are addressed by aria-label, not visible text: a chip reads "4" next to its count,
/// and "4" also appears inside the neighbouring chips' counts.
function chip(label: string) {
  return cy.get(`button[aria-label="${label}"]`);
}

/// Every request the page has made so far, as parsed query params — the sidebar refetches
/// on each change, so assertions target the most recent one.
function lastQuery(): Cypress.Chainable<URLSearchParams> {
  return cy.get("@feed.all").then((calls) => {
    const interceptions = calls as unknown as { request: { url: string } }[];
    return new URLSearchParams(new URL(interceptions[interceptions.length - 1].request.url).search);
  });
}

describe("ENSv1 Explore sidebar", () => {
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
    stubFeed({ total: 9199 });
    cy.visit("/domains");
    cy.wait("@feed");
    cy.contains(/9.199 listings/);
    cy.contains("on this page").should("not.exist");
  });

  it("asks for the selected length chip", () => {
    chip("4 characters").click();
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("lengths")).to.equal("4");
    });
  });

  it("asks for the open-ended chip separately from exact lengths", () => {
    chip("6+ characters").click();
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("lengthAtLeast")).to.equal("6");
      expect(q.get("lengths")).to.equal(null);
    });
  });

  it("ORs multiple chips in one group", () => {
    chip("3 characters").click();
    cy.wait("@feed");
    chip("4 characters").click();
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("lengths")).to.equal("3,4");
    });
  });

  it("shows each chip's count so no chip is a dead end", () => {
    chip("3 characters").should("contain.text", "12");
    chip("6+ characters").should("contain.text", "4,000");
  });

  it("reads a chip with no matches as empty and refuses the click", () => {
    stubFeed({ lengthCounts: { "3": 0, "4": 340, "5": 900, "6+": 4000 } });
    cy.visit("/domains");
    cy.wait("@feed");
    chip("3 characters").should("be.disabled");
  });

  it("asks for the chosen sort order", () => {
    cy.get("select[aria-label='Sort listings']").select("Price ↓");
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("sort")).to.equal("price-desc");
    });
  });

  it("defaults to cheapest first without asking for it explicitly", () => {
    lastQuery().should((q) => {
      expect(q.get("sort")).to.be.oneOf([null, "price-asc"]);
    });
  });

  it("sends a typo'd search query for the server to match fuzzily", () => {
    cy.get("input[aria-label='Search listed names']").type("vitalikk");
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("q")).to.equal("vitalikk");
    });
  });

  it("keeps the price sanity band on until it's switched off", () => {
    lastQuery().should((q) => {
      expect(q.get("includeOutliers")).to.equal(null);
    });
    cy.contains("label", "Include outliers").click();
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("includeOutliers")).to.equal("true");
    });
  });

  it("hides the numeric ranges behind Advanced", () => {
    cy.get("input[aria-label='Minimum price in ETH']").should("not.exist");
    cy.contains("Advanced").click();
    cy.get("input[aria-label='Minimum price in ETH']").should("be.visible");
  });

  it("puts the active filters in the URL so a view can be shared", () => {
    chip("4 characters").click();
    cy.wait("@feed");
    cy.get("select[aria-label='Sort listings']").select("Name A-Z");
    cy.wait("@feed");
    cy.location("search").should((search) => {
      const params = new URLSearchParams(search);
      expect(params.get("lengths")).to.equal("4");
      expect(params.get("sort")).to.equal("name-asc");
    });
  });

  it("restores chips and sort from a shared URL", () => {
    cy.visit("/domains?lengths=3,5&sort=recent");
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("lengths")).to.equal("3,5");
      expect(q.get("sort")).to.equal("recent");
    });
    chip("3 characters").should("have.attr", "aria-pressed", "true");
  });

  it("summarises the active filters and clears them all at once", () => {
    chip("4 characters").click();
    cy.wait("@feed");
    cy.contains("4 characters").should("be.visible");
    cy.contains("button", "Clear all").click();
    cy.wait("@feed");
    lastQuery().should((q) => {
      expect(q.get("lengths")).to.equal(null);
    });
    cy.location("search").should("not.contain", "lengths");
  });

  it("says the result set is empty, not just this page", () => {
    cy.intercept("GET", "/api/ensv1/grails-listings*", {
      listings: [],
      unresolvedCount: 0,
      next: null,
      total: 0,
      totalPages: 1,
      lengthCounts: { "3": 0, "4": 0, "5": 0, "6+": 0 },
    }).as("feed");
    cy.visit("/domains");
    cy.wait("@feed");
    cy.contains("No listings match these filters");
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
    chip("4 characters").should("not.be.visible");
    cy.contains("button", "Filters").click();
    chip("4 characters").should("be.visible");
  });
});
