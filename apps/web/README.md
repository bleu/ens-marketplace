# apps/web

The reference frontend for the beta's demo flows (Slice 1 and Slice 2). Forkable, never the
product — same framing the RFP itself expects: frontend is not a differentiator, the
contracts are.

Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + wagmi/viem + RainbowKit +
`@adraffy/ens-normalize` (ENSIP-15 normalization enforced on every input path — the exact
check OpenSea is documented as skipping).

## Setup

```bash
cp .env.example .env.local   # fill in a WalletConnect project ID + RPC URLs
pnpm install
pnpm dev
```

## Scope

Three genuinely different data sources side by side rather than one unified feed:

- **ENSv2 mock marketplace** (`/domains`, `/domains/[canonicalId]`, `/domains/list`,
  `/subnames/*`) — our own contracts on local Anvil and Sepolia. Browse, list, buy, and
  lease subnames, with expiry and `reclaim()`.
- **Real ENSv1 mainnet** (`/domains/ensv1/[name]`) — real name/owner/resolver lookups,
  real active listings from OpenSea and Grails, a real Seaport buy flow with real ETH.
- **ENSv2 alpha** (`/domains/ensv2-alpha/*`) — commit-reveal registration and a name
  detail view against ENS Labs' alpha deployment. See
  `docs/ensv2-alpha-integration.md`.

Reads of our own marketplace go through Next.js proxy routes (`app/api/domains/*`,
`app/api/subnames/*`) to `apps/api`, which reads the Envio indexer — not client-side event
scans. See `docs/ensv2-indexer.md`. Search, portfolio, and alerts across all of ENS are
grant-scope, not in the beta — see `docs/roadmap.md`.
