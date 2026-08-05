/// Mainnet is the chain wagmi reports with no wallet connected, and it has none of our
/// marketplace contracts — so every ENSv2 surface has to say so rather than read a chain
/// that can't answer. Runs without a wallet on purpose: that's the state being tested.
describe("ENSv2 surfaces without a Sepolia deployment", () => {
  it("offers the ENSv2 source on /domains and gates it", () => {
    cy.visit("/domains");
    // ENSv1 is the default mode, so the real-listings view is what's on screen first.
    cy.contains("Sepolia required").should("not.exist");
    cy.contains("button", "ENSv2 mock").click();
    cy.contains("Our ENSv2 marketplace lives on Sepolia").should("be.visible");
  });

  it("gates /subnames and its register page", () => {
    cy.visit("/subnames");
    cy.contains("Sepolia required").should("be.visible");
    cy.visit("/subnames/register");
    cy.contains("Sepolia required").should("be.visible");
  });

  // /domains/list isn't here: the listing flow is disabled, so that route says so
  // instead of gating on a chain (see navigation.cy.ts).
  it("gates the ENSv2 detail pages", () => {
    cy.visit("/domains/1");
    cy.contains("Sepolia required").should("be.visible");
    cy.visit("/subnames/1");
    cy.contains("Sepolia required").should("be.visible");
  });

  it("asks for a wallet rather than a chain switch when none is connected", () => {
    cy.visit("/subnames");
    cy.contains("Connect a wallet on Sepolia").should("be.visible");
    cy.contains("button", "Switch to Sepolia").should("not.exist");
  });
});
