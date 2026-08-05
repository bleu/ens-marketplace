import { ANVIL_ADDRESSES } from "../support/anvil-tasks";

const ORDER_STATUS_FILLED = 3;

/// Wallet-driven write flows against the real local Anvil chain, using a fake EIP-1193
/// provider that impersonates one of Anvil's own "unlocked" dev accounts (see
/// support/wallet.ts) — real contract calls, real state changes, no mocking of the app
/// itself. Each test registers its own uniquely-named domain rather than reusing the
/// shared alice/bob/charlie seed data, so tests stay independent and re-runnable.
///
/// Verifies final state via direct contract reads (cy.task, see support/anvil-tasks.ts)
/// rather than the UI's "Owner" row — that row shows CanonicalIdOrderManager.orders(id)
/// .seller, which is the *original lister* and never updates after a sale (only
/// order.status flips to Filled; the registry's actual owner is the real source of truth
/// for "who owns it now").
describe("ENSv2 list + buy (real contract calls on local Anvil)", () => {
  it("lists a fresh name via the UI, then buys it as a different wallet", () => {
    const name = `cy-list-${Date.now()}.eth`;

    // --- List, as the seller ---
    cy.visitConnected("/domains/list", ANVIL_ADDRESSES.alice);
    cy.get('input[aria-label="Name to register"]').type(name);
    cy.contains("button", "Register to my address").click();
    // Register tx confirms + owner refetches; the register button then disappears since
    // the connected wallet now owns it (isUnregistered flips false).
    cy.contains("button", "Register to my address", { timeout: 15000 }).should("not.exist");

    cy.get('input[aria-label="Price in ETH"]').type("0.05");
    cy.contains("button", "List name").should("not.be.disabled").click();
    // listForSale -> approveTransfer, then (on receipt) list(), then redirects here.
    cy.location("pathname", { timeout: 15000 })
      .should("match", /^\/domains\/\d+$/)
      .then((pathname) => {
        const canonicalId = pathname.split("/").pop()!;
        cy.wrap(canonicalId).as("canonicalId");
      });
    cy.contains(name);

    // --- Buy, as a different wallet ---
    cy.get("@canonicalId").then((canonicalId) => {
      cy.visitConnected(`/domains/${canonicalId}`, ANVIL_ADDRESSES.dave);
    });
    cy.contains("button", "Buy now · 0.05 ETH").click();
    cy.contains("button", "Buy now · 0.05 ETH", { timeout: 15000 }).should("not.exist");

    cy.get("@canonicalId").then((canonicalId) => {
      cy.task("anvilReadOwner", canonicalId).should("eq", ANVIL_ADDRESSES.dave);
      cy.task("anvilReadOrderStatus", canonicalId).should("eq", ORDER_STATUS_FILLED);
    });
  });
});

describe("ENSv2 regeneration-aware suspension (real contract calls on local Anvil)", () => {
  it("suspends on a post-listing mutation, shows the diff, and completes via explicit accept", () => {
    const name = `cy-suspend-${Date.now()}.eth`;

    cy.task("anvilRegisterAndList", { name, actor: "alice", priceEth: "0.1" }).then((result) => {
      const { canonicalId } = result as { canonicalId: string };
      cy.wrap(canonicalId).as("canonicalId");
      cy.task("anvilMutateResolver", { canonicalId, actor: "alice", newResolver: ANVIL_ADDRESSES.charlie }).then(() => {
        cy.visitConnected(`/domains/${canonicalId}`, ANVIL_ADDRESSES.dave);
      });
    });

    cy.contains("button", "Buy now · 0.1 ETH").click();
    cy.contains("This name's state changed since it was listed", { timeout: 15000 });
    cy.contains("Resolver")
      .parents("tr")
      .within(() => {
        cy.get("a").should("have.length", 2);
      });
    // Buying against mismatched state doesn't fill the order — refunded in full instead
    // of transferring ownership (CanonicalIdOrderManager.buy's Suspended branch).
    cy.get("@canonicalId").then((canonicalId) => {
      cy.task("anvilReadOwner", canonicalId).should("eq", ANVIL_ADDRESSES.alice);
    });

    cy.contains("button", "Accept new state and buy anyway").click();
    cy.contains("This name's state changed since it was listed", { timeout: 15000 }).should("not.exist");

    cy.get("@canonicalId").then((canonicalId) => {
      cy.task("anvilReadOwner", canonicalId).should("eq", ANVIL_ADDRESSES.dave);
      cy.task("anvilReadOrderStatus", canonicalId).should("eq", ORDER_STATUS_FILLED);
    });
  });
});
