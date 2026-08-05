/// ENSv1 (real mainnet) Explore coverage — stubs our own /api/ensv1/* proxy routes via
/// cy.intercept rather than hitting the real Grails/OpenSea APIs, so these tests are
/// deterministic and don't depend on external rate limits or API keys being configured.
describe("ENSv1 Explore — Grails and OpenSea as separate, unmixed sources", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/ensv1/grails-listings*page=1*", { fixture: "grails-page1.json" }).as("grailsPage1");
    cy.intercept("GET", "/api/ensv1/listings*", { fixture: "opensea-page1.json" }).as("openseaPage1");
    cy.visit("/domains?refine=grails");
  });

  it("defaults to Grails and shows its total-listing count", () => {
    cy.wait("@grailsPage1");
    cy.contains("Listings — Grails");
    cy.contains("cyfixture1.eth");
    cy.contains("cyfixture2.eth");
    // Locale-agnostic: toLocaleString()'s grouping separator depends on the runtime's
    // default locale (e.g. "9,199" vs "9.199"), so match on the digits loosely rather
    // than a specific separator.
    cy.contains(/Grails has 9.199 listings total/);
  });

  it("has no merged \"All\" option — only Grails and OpenSea", () => {
    cy.contains("button", "All").should("not.exist");
    cy.contains("button", "Grails").should("be.visible");
    cy.contains("button", "OpenSea").should("be.visible");
  });

  it("switching to OpenSea fetches only OpenSea, never mixes in Grails rows", () => {
    cy.contains("button", "OpenSea").click();
    cy.wait("@openseaPage1");
    cy.contains("Listings — OpenSea");
    cy.contains("cyopensea1.eth");
    cy.contains("cyfixture1.eth").should("not.exist");
    cy.get("@grailsPage1.all").should("have.length", 1); // only the initial mount fetch, not re-fetched on switch
  });

  it("shows the unresolved-listings note when Grails returns unfulfillable orders", () => {
    cy.wait("@grailsPage1");
    cy.contains("3 other active Grails listings on this page couldn't be resolved");
  });
});
