/// ENSv1 name detail page, mocked at the /api/ensv1/* boundary so it's deterministic and
/// doesn't depend on real mainnet data or external API keys.
describe("ENSv1 name detail page", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/ensv1/search?name=cyfixture.eth", { fixture: "ensv1-domain.json" }).as("domain");
    cy.intercept("GET", "/api/ensv1/grails-listings?name=cyfixture.eth", { listing: null }).as("grailsLookup");
    cy.intercept("GET", "/api/ensv1/listings?name=cyfixture.eth", { listing: null }).as("openseaLookup");
    cy.visit("/domains/ensv1/cyfixture.eth");
    cy.wait(["@domain", "@grailsLookup", "@openseaLookup"]);
  });

  it("shows real owner/resolver/resolved-address, each linked to Etherscan mainnet", () => {
    cy.contains("cyfixture.eth");
    ["Owner", "Resolver", "Resolved address"].forEach((label) => {
      cy.contains(label)
        .parent()
        .find("a")
        .should("have.attr", "href")
        .and("match", /^https:\/\/etherscan\.io\/address\/0x/);
    });
  });

  it("warns that buying spends mainnet ETH, without naming our plumbing", () => {
    cy.contains("Buying this name spends ETH on Ethereum mainnet.");
    cy.contains(/subgraph/i).should("not.exist");
  });

  it("has no listing to buy when neither source has one", () => {
    cy.contains("button", "Buy now").should("not.exist");
  });
});
