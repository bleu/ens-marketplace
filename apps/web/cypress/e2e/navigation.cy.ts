describe("top-level navigation", () => {
  it("redirects / to /domains (Explore is home)", () => {
    cy.visit("/");
    cy.location("pathname").should("eq", "/domains");
  });

  it("shows the top nav on every page", () => {
    cy.visit("/domains");
    cy.contains("a", "Explore").should("have.attr", "href", "/domains");
    // One placeholder for every mode — the search box used to relabel itself per mode,
    // which only ever restated what the Source picker already said.
    cy.get('input[placeholder="Search names…"]').should("be.visible");
    cy.contains("button", "Connect wallet").should("be.visible");
  });
});
