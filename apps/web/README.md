# apps/web

The reference frontend for the beta's demo flows (Slice 1 and Slice 2). Forkable, never the product — same framing the RFP itself expects: frontend is not a differentiator, the contracts are.

Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + wagmi/viem + RainbowKit + `@adraffy/ens-normalize` (ENSIP-15 normalization enforced on every input path — the exact check OpenSea is documented as skipping).

## Setup

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. It works with no configuration and no wallet: mainnet is the default chain, so `/domains` opens on the read-only ENSv1 view straight away. There is no `.env.example` — create `.env.local` yourself if you want any of these.

| Variable | Needed for | Without it |
|---|---|---|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | The WalletConnect/Reown connector | Only injected + Safe connectors are offered. Must be a real 32-char hex project id; a placeholder is ignored deliberately (see `lib/wagmi.ts`) |
| `THEGRAPH_API_KEY` | ENSv1 name/owner/resolver lookups via the ENS subgraph | ENSv1 name detail pages can't resolve |
| `OPENSEA_API_KEY` | OpenSea listings and the Seaport buy flow | The OpenSea source reports itself as not configured; Grails still works |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | Sepolia reads | Falls back to a public archive node. The chain-default endpoint is deliberately not trusted — it fails under the ENSv2 alpha activity scan's concurrent `eth_getLogs` |
| `NEXT_PUBLIC_MAINNET_RPC_URL` | Mainnet reads | Falls back to the chain default |
| `GRAILS_API_URL` | Grails listings | Defaults to the public Grails API |

## The two sources

`/domains` browses two genuinely different name universes, picked from the Source list in the sidebar rather than merged into one feed. Which one is offered depends on the connected chain.

- **ENSv1 · Grails · OpenSea** (mainnet) — live ENS names, read-only ownership, active listings, and a Seaport buy flow that spends mainnet ETH. The default, and the only one that needs no wallet.
- **ENSv2 alpha** (Sepolia) — ENS Labs' own ENSv2 alpha contracts. Commit-reveal registration paid in an ERC-20. Pre-audit and unofficial; the addresses can change without notice. See `docs/ensv2-alpha-integration.md`.

## Tests

```bash
pnpm cypress:run       # headless, against whatever's already running on :3000
pnpm cypress:open      # interactive runner
pnpm e2e               # builds a production bundle, serves it, runs the suite — this is what CI runs
```

Every spec is read-only and stubs its data at the `/api/ensv1/*` boundary with `cy.intercept`, so they need no chain, no backend, and no API keys.

## Scope

Per the product definition this is a beta, not a finished product. Live today: Explore and detail pages for mainnet ENSv1 data (listing and buying) and ENSv2 alpha registration. Offers, categories, valuation, and collection bids are deliberately inert placeholders — visibly labelled "Coming soon" rather than controls that silently do nothing. See `docs/slice-1.md`, `docs/slice-2.md`, and `docs/roadmap.md`.
