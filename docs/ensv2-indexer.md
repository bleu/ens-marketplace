# Indexing our own ENSv2 marketplace with Envio HyperIndex

The ENSv2 mock marketplace originally had no indexer (a deliberate, documented choice) —
`apps/web/lib/events.ts`'s hooks did live, unbounded `eth_getLogs` scans on every page
load, plus a full-dataset `orders()`/`nameOf()` multicall on a 3-second poll regardless of
which page was visible. That already produced real RPC rate-limit failures at today's tiny
scale; at "thousands of domains listed" it gets categorically worse. This doc records the
fix: indexing our own on-chain events into a real database and serving paginated,
pre-joined queries instead.

## Architecture

- **`apps/indexer`** — an [Envio HyperIndex](https://envio.dev) project (own Postgres +
  Hasura GraphQL API, run via Docker) — not a hand-rolled polling loop. Reorg-handling,
  chunked historical backfill, and checkpointing are exactly the kind of infrastructure
  not worth reinventing; Envio was chosen over Ponder as the out-of-the-box option here.
  - `config.yaml` — one `Registry`/`OrderManager`/`LeaseVault` contract definition (kept separate from the chain list so more chains can be added without touching it), addresses/`start_block` supplied per chain. Sepolia is the only chain today, and it indexes via plain RPC (`for: sync`, not HyperSync) — see below for why, and how to switch it to HyperSync once you have a token.
  - `schema.graphql` — `IndexedName`, `DomainOrder`, `SubnameListing`, `DomainActivity`
    entities.
  - `src/handlers/{Registry,OrderManager,LeaseVault}.ts` — one `indexer.onEvent(...)`
    handler per event, verified against the actual Solidity contracts
    (`contracts/src/v2/CanonicalIdOrderManager.sol`, `SubnameLeaseVault.sol`) for exact
    status-transition and event-field semantics, not just the frontend's ABI.
- **`apps/api`** gets a new `DomainsModule`/`SubnamesModule` — a thin, read-only GraphQL
  client of the indexer's Hasura endpoint (`IndexerGraphqlService`, via `graphql-request`),
  reshaping results into REST (`GET /domains/search`, `/domains/:id/activity`,
  `/domains/:id/last-sale`, `/domains/owned`, `/subnames/search`, `/subnames/count`).
  apps/api never owns this data's schema — Envio does.
- **`apps/web`** gets new Next.js proxy routes under `app/api/domains/*` and
  `app/api/subnames/*` (same "Next.js always fronts backend calls" pattern as the Grails
  migration), forwarding to apps/api via `DOMAINS_API_URL`.
- `apps/web/lib/events.ts`'s hooks now fetch from these proxy routes instead of scanning
  events client-side: `useDomainSearch`/`useSubnameSearch` (new, paginated, replacing
  `useKnownDomainIds`/`useKnownSubnameIds` + the old multicall) and `useLastSale`/
  `useNameActivity`/`useSubnameCount`/`useOwnedNames` (same signatures as before, now
  backed by the indexer instead of a live scan).

## A subtlety worth knowing: `SubnameListing.parentAddress` vs. registry `parentId`

`SubnameLeaseVault.sol`'s `Announced` event's `parent` field is the **address** that
announced the lease (an authorization concept), not the parent name's canonical ID.
Registry-level subname hierarchy (`shop.alice.eth`'s parent is `alice.eth`'s canonical ID)
comes from a *different* event — `Registry.SubnameRegistered` — and lands on
`IndexedName.parentId`. `GET /subnames/count?parentId=` counts against `IndexedName`, not
`SubnameListing`, for exactly this reason.

## Running it locally

No chain to run — the contracts this indexes are already live on Sepolia (addresses in the root `README.md`), so a first `pnpm dev` backfills from their deploy block over the public RPC and then follows the chain.

```bash
# 1. The indexer (needs Docker running — spins up its own Postgres + Hasura)
cd apps/indexer
pnpm dev
# GraphQL playground: http://localhost:8080/v1/graphql (admin secret: testing)

# 2. apps/api (separate terminal)
cd apps/api
pnpm run start:dev   # listens on :3001, INDEXER_GRAPHQL_URL defaults to localhost:8080

# 3. apps/web (separate terminal) — DOMAINS_API_URL defaults to localhost:3001
cd apps/web
pnpm dev
```

**Note on `ENVIO_API_TOKEN`:** HyperIndex itself is fully open-source and self-hostable —
the token is only for **HyperSync** (Envio's accelerated historical-log service). Sepolia is configured to index via plain RPC (`for: sync` in `config.yaml`) instead, so nothing here needs a token out of the box. A plain `rpc:` string alone isn't enough for a HyperSync-covered chain like Sepolia — it only becomes a *fallback*, and HyperSync (and its token requirement) stays primary; `for: sync` is what actually forces RPC to be used instead. Once you want HyperSync's speed edge for Sepolia, get a free token at https://envio.dev/app/api-tokens, set `ENVIO_API_TOKEN`, and drop the Sepolia chain's `rpc:` override in `config.yaml` (or change `for:` to `fallback`/`realtime`).

## Production hosting

Self-hosted via Docker Compose (`deploy/docker-compose.yml`), following the same pattern as
[`enviodev/local-docker-example`](https://github.com/enviodev/local-docker-example): five
services — `indexer-postgres` + `graphql-engine` (Hasura) + `indexer` for the Envio side,
and `api-postgres` + `api` for apps/api's own Grails database (a separate Postgres — Envio
owns and migrates its own schema; apps/api is only ever a GraphQL client of it). Only `api`
is published to the host; everything else talks over the compose's own internal network by
service name, never reachable from outside.

Deployed on Bleu's shared `bleu-generic-1` host, following that server's existing
per-project convention (own directory, own `docker-compose.yml`, Caddy reverse-proxying a
`<project>.bleu.blue` subdomain to the app's published port):

```bash
# On the server, inside the cloned repo:
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

`deploy/.env` (not committed — see `deploy/.env.example` for the required keys) holds the
generated Postgres/Hasura passwords and the real `ENVIO_API_TOKEN`. Public URL:
`https://ens-marketplace-api.bleu.blue` (Caddy → `127.0.0.1:${API_EXPOSED_PORT:-41000}`),
set as `DOMAINS_API_URL`/`GRAILS_API_URL` in the Vercel-deployed frontend's production
environment. The indexer's own config here (`config.production.yaml`) indexes Sepolia,
which is the only chain either config lists — the local dev chain this used to also index
is gone.

## What this does NOT change

- The on-chain contracts (`CanonicalIdOrderManager`, registry, `SubnameLeaseVault`) —
  unchanged, still the real source of truth the indexer reads from.
- The Grails pipeline (`apps/api/src/grails/*`) — untouched, a separate concern in the
  same NestJS service (see `docs/grails-migration.md`).
- Real-time-ness for a *connected wallet's own actions* (list/buy/relist) — those still get
  instant local feedback via `useWaitForTransactionReceipt`; the indexer's lag only affects
  *other users'* view of the change.
