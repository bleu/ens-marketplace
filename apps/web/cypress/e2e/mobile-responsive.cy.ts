/// Regression coverage for BLEUDEV-235: page-level containers used a flat `p-8`/`px-8`
/// (32px) with no responsive scale-down, unlike TopNav's own `px-4 lg:px-8` — at true
/// phone widths (~375px) that ate ~17% of the viewport on every page just for edge
/// padding.
describe("mobile viewport (375px)", () => {
  beforeEach(() => {
    cy.viewport(375, 700);
  });

  it("Explore page: no horizontal overflow", () => {
    cy.visit("/domains");
    cy.document().then((doc) => {
      // +2px tolerance for sub-pixel layout rounding, not a real overflow allowance.
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth + 2);
    });
  });
});
