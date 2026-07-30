import { installFakeWallet } from "./wallet";

/// Visits `url` with a fake injected wallet already impersonating `address` (see
/// wallet.ts) before any app JS runs. wagmi's injected connector auto-reconnects as soon
/// as it sees a provider whose eth_accounts already returns an address — confirmed live,
/// no RainbowKit "Connect wallet" modal click-through needed at all. Waits for the top
/// nav to show the connected address (rather than "Connect wallet") before continuing,
/// so callers never race the auto-connect.
Cypress.Commands.add("visitConnected", (url: string, address: string) => {
  cy.visit(url, {
    onBeforeLoad(win) {
      installFakeWallet(win, address);
    },
  });
  cy.contains("button", "Connect wallet").should("not.exist");
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      visitConnected(url: string, address: string): Chainable<void>;
    }
  }
}
