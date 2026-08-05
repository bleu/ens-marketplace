/// Regression coverage for BLEUDEV-235: page-level containers used a flat `p-8`/`px-8`
/// (32px) with no responsive scale-down, unlike TopNav's own `px-4 lg:px-8` — at true
/// phone widths (~375px) that ate ~17% of the viewport on every page just for edge
/// padding, and on /domains specifically left so little room for the Names/Listings/
/// Premium/Available/Activity tab strip that "Premium" was cut off mid-word before the
/// ScrollHint overflow chevron.
describe("mobile viewport (375px)", () => {
  beforeEach(() => {
    cy.viewport(375, 700);
  });

  it("Explore page: no horizontal overflow, and enough room to show Premium before the tabs overflow", () => {
    cy.visit("/domains");
    cy.document().then((doc) => {
      // +2px tolerance for sub-pixel layout rounding, not a real overflow allowance.
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth + 2);
    });
    cy.contains("button", "Names").should("be.visible");
    cy.contains("button", "Listings").should("be.visible");
    cy.contains("button", "Premium").should("be.visible");
  });

  it("List-a-name page: no horizontal overflow", () => {
    cy.visit("/domains/list");
    cy.document().then((doc) => {
      // +2px tolerance for sub-pixel layout rounding, not a real overflow allowance.
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth + 2);
    });
  });

  it("Subnames page: no horizontal overflow", () => {
    cy.visit("/subnames");
    cy.document().then((doc) => {
      // +2px tolerance for sub-pixel layout rounding, not a real overflow allowance.
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth + 2);
    });
  });
});
