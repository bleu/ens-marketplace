describe("top-level navigation", () => {
  it("redirects / to /domains (Explore is home)", () => {
    cy.visit("/");
    cy.location("pathname").should("eq", "/domains");
  });

  it("shows the top nav on every page", () => {
    cy.visit("/domains");
    cy.contains("a", "Explore").should("have.attr", "href", "/domains");
    cy.contains("a", "Subnames").should("have.attr", "href", "/subnames");
    cy.contains("a", "List a name").should("have.attr", "href", "/domains/list");
    cy.get('input[placeholder="Search names…"]').should("be.visible");
    cy.contains("button", "Connect wallet").should("be.visible");
  });

  it("navigates to Subnames via the top nav", () => {
    cy.visit("/domains");
    cy.contains("a", "Subnames").click();
    cy.location("pathname").should("eq", "/subnames");
  });

  it("navigates to List a name via the top nav", () => {
    cy.visit("/domains");
    cy.contains("a", "List a name").click();
    cy.location("pathname").should("eq", "/domains/list");
  });
});
