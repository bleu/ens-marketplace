// Stub for @coinbase/cdp-sdk.
//
// @wagmi/connectors depends on @base-org/account, whose payment/charge/subscription
// features (unused here — this is an ENS marketplace demo, not a Base Account payments
// integration) import { CdpClient } from '@coinbase/cdp-sdk'. That SDK's real code has
// dynamic imports for optional @x402/* payment-protocol packages that aren't installed,
// which Next.js's Turbopack statically resolves at build time and fails on — even though
// the code path never runs for us. Grails hits the same @wagmi/connectors dependency
// (confirmed via their lockfile) and doesn't install @x402/* either.
//
// Aliasing the whole package to this no-op stub avoids ever loading cdp-sdk's real code
// (and its internal x402 imports) at all, rather than chasing individual x402 subpath
// exports — smaller surface, and doesn't depend on cdp-sdk's internal file layout.
export class CdpClient {
  constructor() {
    throw new Error(
      "@coinbase/cdp-sdk is stubbed out in this repo (unused Base Account payment feature) — see apps/web/stubs/cdp-sdk-noop.ts",
    );
  }
}
