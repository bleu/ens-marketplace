import { defineConfig } from "cypress";
import { registerAnvilTasks } from "./cypress/support/anvil-tasks";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    supportFile: "cypress/support/e2e.ts",
    // Cypress's default (1000px) is narrower than the top nav's `lg:` breakpoint
    // (1024px) — below that, search/nav-links/List-a-name are legitimately hidden in
    // favor of a mobile menu (see BLEUDEV-235). Use a real desktop width so tests
    // exercise the desktop nav these specs assume.
    viewportWidth: 1280,
    viewportHeight: 800,
    // Next dev's Turbopack JIT-compiles each route on its first-ever request — well past
    // the 4s default for a route nobody's hit yet. A production build (next build && next
    // start, as CI uses) doesn't have this latency; this generous timeout is for local
    // runs against `pnpm dev`.
    defaultCommandTimeout: 10000,
    setupNodeEvents(on, config) {
      registerAnvilTasks(on);
      return config;
    },
  },
});
