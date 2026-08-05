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
| `DOMAINS_API_URL` | The ENSv2 mock marketplace's indexed data, via apps/api | Defaults to `http://localhost:3001`. See `docs/ensv2-indexer.md` for the full local stack |
| `GRAILS_API_URL` | Grails listings | Defaults to the public Grails API |

## The three sources

`/domains` browses three genuinely different name universes, picked from the Source list in the sidebar rather than merged into one feed. Which ones are offered depends on the connected chain.

- **ENSv1 · Grails · OpenSea** (mainnet) — live ENS names, read-only ownership, active listings, and a Seaport buy flow that spends mainnet ETH. The default, and the only one that needs no wallet.
- **ENSv2 mock** (Sepolia) — our own `MockENSv2Registry` + marketplace contracts. The full read/write feature set: list, buy, relist, cancel, suspend/diff/accept-refill, and subname announce/rent/reclaim. Needs a wallet on Sepolia; every ENSv2 page shows a "Switch to Sepolia" panel otherwise.
- **ENSv2 alpha** (Sepolia) — ENS Labs' own ENSv2 alpha contracts, not our mock. Commit-reveal registration paid in an ERC-20. Pre-audit and unofficial; the addresses can change without notice.

### Seed data on the ENSv2 mock

`contracts/script/DeployV2Sepolia.s.sol` seeds these when it deploys, so there's something to click through immediately. Every one is owned by the single deployer address (see that script for why it isn't one key per actor).

| Name | State |
|---|---|
| `alice.eth` | Listed for sale, 0.5 ETH |
| `bob.xyz` | Listed at 0.05 ETH, then mutated post-listing — **already shows as Suspended with a state diff on first load** |
| `charlie.eth` | Unlisted — available for a live "list your domain" walkthrough |
| `shop.alice.eth` | Subname, announced for rent at 0.1 ETH / 30 days |
| `blog.alice.eth` | Subname, already leased with a ~5 minute term — lets you demo expiry + `reclaim()` without a long wait |

This state is live and shared, so a walkthrough can leave it changed. Re-running the deploy script produces a fresh instance at new addresses, which then have to be updated in `lib/contracts.ts`, `apps/indexer/config.yaml`, and the root README.

## Tests

```bash
pnpm cypress:run       # headless, against whatever's already running on :3000
pnpm cypress:open      # interactive runner
pnpm e2e               # builds a production bundle, serves it, runs the suite — this is what CI runs
```

Every spec is read-only and stubs its data at the `/api/ensv1/*` boundary with `cy.intercept`, so they need no chain, no backend, and no API keys. There used to be write-flow specs driving transactions against a local chain; they went with the local chain itself, so the list/buy/rent flows currently have no automated coverage beyond the Foundry tests.

## Scope

Per the product definition this is a beta, not a finished product. Live today: Explore and detail pages for both the ENSv2 mock marketplace and mainnet ENSv1 data, listing and buying, subname leasing, and ENSv2 alpha registration. Offers, categories, valuation, and collection bids are deliberately inert placeholders — visibly labelled "Coming soon" rather than controls that silently do nothing. See `docs/slice-1.md`, `docs/slice-2.md`, and `docs/roadmap.md`.
