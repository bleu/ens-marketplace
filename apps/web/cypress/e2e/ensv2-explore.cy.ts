/// Read-only coverage against the real local Anvil chain + seeded demo data (see
/// docs/local-dev.md — alice.eth Active/0.5 ETH, bob.xyz Suspended/1 ETH). Requires
/// `anvil` running and `forge script script/DeployLocal.s.sol --broadcast` already applied
/// (both a prerequisite for the whole web app, not just these tests).
describe("ENSv2 Explore grid (local Anvil, Namechain)", () => {
  beforeEach(() => {
    cy.visit("/domains");
  });

  it("lists the seeded names with their on-chain status", () => {
    // cy.contains("alice.eth") already resolves to the row's own <a class="explore-row">
    // (Cypress prefers link/button ancestors over the plain <span> holding the text), so
    // .closest() (self-inclusive) is correct here — .parents() would exclude it.
    cy.contains("alice.eth").closest(".explore-row").within(() => {
      cy.contains("0.5 ETH");
      cy.contains("Active");
    });
    cy.contains("bob.xyz").closest(".explore-row").within(() => {
      cy.contains("1 ETH");
      cy.contains("Suspended");
    });
  });

  it("Listings tab filters out names with no active/suspended order", () => {
    cy.contains("button", "Listings").click();
    cy.contains("alice.eth").should("exist");
    cy.contains("bob.xyz").should("exist");
  });
});

describe("ENSv2 domain detail — Active order (alice.eth)", () => {
  it("shows the listing and an Otterscan link for the owner", () => {
    cy.visit("/domains");
    cy.contains("alice.eth").click();
    cy.location("pathname").should("match", /^\/domains\/\d+$/);
    cy.contains("bob.xyz").should("not.exist");
    cy.contains("1 ETH").should("not.exist");
    cy.contains("Owner").parent().find("a").should("have.attr", "href").and("include", "http://localhost:5100/address/");
    cy.contains("0.5 ETH");
  });
});

describe("ENSv2 domain detail — Suspended order (bob.xyz)", () => {
  it("shows the regeneration-aware suspension banner and a before/after diff table", () => {
    cy.visit("/domains");
    cy.contains("bob.xyz").click();
    cy.location("pathname").should("match", /^\/domains\/\d+$/);
    cy.contains("This name's state changed since it was listed");
    cy.contains("Resolver").parents("tr").within(() => {
      // pinned ("At listing") and live ("Now") resolver values differ — both rendered as
      // explorer links, not just plain shortened text.
      cy.get("a").should("have.length", 2);
      cy.get("a").each(($a) => {
        expect($a.attr("href")).to.include("http://localhost:5100/address/");
      });
    });
  });
});
