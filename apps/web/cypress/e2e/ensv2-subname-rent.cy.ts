import { ANVIL_ADDRESSES } from "../support/anvil-tasks";

/// Subname rent + expiry + reclaim, against the real local Anvil chain and the real
/// SubnameLeaseVault contract — a fresh parent + subname per run so this never depends
/// on (or mutates) the shared shop.alice.eth/blog.alice.eth seed data.
describe("Subname rent, expiry, and reclaim (real contract calls on local Anvil)", () => {
  it("rents as a tenant, then reclaims back to the parent after the term expires", () => {
    const parentName = `cy-parent-${Date.now()}.eth`;

    cy.task("anvilRegisterAndList", { name: parentName, actor: "alice", priceEth: "0.01" }).then((parentResult) => {
      const { canonicalId: parentId } = parentResult as { canonicalId: string };
      cy.task("anvilRegisterSubnameAndAnnounce", {
        parentId,
        label: "shop",
        actor: "alice",
        priceEth: "0.02",
        termSeconds: 5,
      }).then((subResult) => {
        const { canonicalId: subId } = subResult as { canonicalId: string };
        cy.wrap(subId).as("subId");
        cy.visitConnected(`/subnames/${subId}`, ANVIL_ADDRESSES.dave);
      });
    });

    cy.contains("button", "Rent for 0.02 ETH").click();
    cy.contains("Currently leased to", { timeout: 15000 });
    cy.contains(ANVIL_ADDRESSES.dave.slice(0, 6));

    // Expiry (isExpiredUnreclaimed in app/subnames/[canonicalId]/page.tsx) compares the
    // lease's activeUntil against the real wall clock (Date.now()), not the chain's block
    // timestamp — no chain-time-skip trick can shortcut this, a real wait is unavoidable.
    // Relying on the page's own 3s poll (refetchInterval) to pick this up on its own
    // doesn't work headless: react-query defaults refetchIntervalInBackground to false,
    // and a headless tab reports as backgrounded, so polling silently never fires. A fresh
    // navigation forces a fresh mount/read instead — but plain cy.reload() loses the fake
    // wallet (the injected provider only re-applies via cy.visit's onBeforeLoad, not a
    // reload), which pops RainbowKit's connect modal open instead of showing the page.
    // visitConnected() re-injects it. reclaim() is permissionless (no caller-identity
    // check in SubnameLeaseVault.reclaim or this page), so no wallet switch is needed
    // either — dave stays connected throughout.
    cy.wait(6000);
    cy.get("@subId").then((subId) => {
      cy.visitConnected(`/subnames/${subId}`, ANVIL_ADDRESSES.dave);
    });
    cy.contains("button", "Reclaim (returns control to parent)", { timeout: 15000 }).click();
    cy.contains("Currently leased to", { timeout: 15000 }).should("not.exist");
    cy.contains("button", "Rent for 0.02 ETH");
  });
});
