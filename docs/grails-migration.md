# Grails migration: from a live API call to our own database

Grails (grails.app, run by EthID) is one of the two real ENSv1 mainnet listing sources
this app reads from live today. Its public API is reportedly being discontinued. This doc
records why we scrape and store our own copy instead, what the limits of that are, and
how to run the pieces.

## Why this exists

`apps/web/app/api/ensv1/grails-listings/route.ts` used to call
`https://api.grails.app/api/v1/search` directly on every page load. Once Grails' API goes
away, that call fails outright — every visitor to the Grails source view would see a
broken feed. `apps/api` (a separate NestJS + Prisma service, added to this monorepo) scrapes
Grails' listings into our own Postgres database ahead of that cutoff, and the same Next.js
route now proxies to `apps/api` instead of calling Grails.

**The frontend didn't change at all.** `apps/api`'s `/grails/search` and `/grails/by-name`
endpoints return the exact same shape the route always has
(`{listings, unresolvedCount, next, total, totalPages}` / `{listing}}`) — `useGrailsListings`
(`apps/web/lib/ensv1-client.ts`) and `apps/web/app/domains/page.tsx` needed zero changes.

## The real limitation: this is a snapshot, not a live feed

Grails listings are **off-chain signed Seaport orders** — real `order_hash`/`signature`/
`protocol_data`, but never written on-chain until someone actually fulfills them. That
means they're not something we can discover independently via on-chain events; the only
way to know a listing exists is to ask Grails' own backend. Once their API is fully gone:

- No new listings will appear.
- No price changes or cancellations will be reflected.
- Our database is frozen at whatever it last successfully scraped.

The scraper (below) keeps re-running on a schedule for as long as Grails' API stays
reachable, to keep that snapshot as fresh as possible right up to the actual cutoff. Once
it's confirmed gone, the honest thing to do is add a "listings as of {last successful
scrape}" disclosure somewhere visible in the Grails source view — not implemented yet,
tracked here as the next step once that day comes.

## Architecture

- **`apps/api`** — a separate NestJS + Prisma service in this monorepo (its own
  `package.json`, deployed independently of the Next.js app — Vercel doesn't run
  long-running Node processes, so this needs its own hosting; out of scope for this doc,
  see the note at the bottom).
  - `prisma/schema.prisma` — one `GrailsListing` model, one row per real Grails order,
    keyed on `orderHash` (a relisted name gets a new order, so this — not `name` — is the
    natural key upserts use).
  - `src/grails/` — `GrailsController`/`GrailsService`: query Postgres with the exact same
    filter semantics Grails' own API (and this route) already used —
    `minPrice`/`maxPrice` (ETH → wei), `minLength`/`maxLength`, `startsWith`/`endsWith`,
    paginated 50/page.
  - `src/scraper/` — `ScraperService` paginates Grails' live `search` endpoint, validates
    each result with the same `isFulfillable` check `route.ts` always used (ported
    verbatim, not reimplemented, so the two paths can't silently disagree on what counts
    as a real listing), and upserts into Postgres. `scrape-grails.script.ts` is the CLI
    entrypoint — bypasses Nest's DI container (esbuild/`tsx`, which runs this, doesn't
    emit the decorator metadata Nest's constructor injection needs) and instantiates
    `PrismaService`/`ScraperService` directly.

### A real bug this surfaced: wei doesn't fit in a 64-bit integer

`priceWei` is a Prisma `Decimal(78, 0)`, not a `BigInt`/Postgres `bigint`. `bigint` tops out
around 9.2×10¹⁸ (≈9.2 ETH in wei) — the very first full backfill hit a genuine 40 ETH
listing that overflowed it, and the real dataset has listings priced far higher than that
(one at ~1.2×10²⁶ wei, i.e. ~120 million ETH — clearly a troll listing, but real data
Grails' API actually returns). `Decimal(78, 0)` comfortably covers any real `uint256` wei
amount.

## Running it

**One-time backfill / manual refresh:**
```bash
cd apps/api
cp .env.example .env   # set DATABASE_URL to a real Postgres — a local Docker container is
                        # fine for dev: docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
pnpm install            # apps/api's postinstall runs `prisma generate` automatically
pnpm exec prisma migrate dev --name init
pnpm run scrape:grails
```

**Scheduled re-scraping (production):** a cron job on `bleu-generic-1` runs the scraper
every 6 hours, for as long as Grails' API stays up:
```
0 */6 * * * cd /home/bleu/ens-marketplace && docker compose -f deploy/docker-compose.yml --env-file deploy/.env run --rm api pnpm run scrape:grails >> /home/bleu/ens-marketplace/scrape-grails.log 2>&1
```
This runs inside the same Docker Compose network as `apps/api` (see "Production hosting"
in `docs/ensv2-indexer.md`) so it can reach `api-postgres`, which isn't exposed to the
internet. A GitHub Actions version of this job isn't viable here — Actions runners have no
network path into that private database.

**Serving it to the Next.js app:** start `apps/api` (`pnpm --filter api run start:dev`,
listens on port 3001 by default) and point `apps/web/.env.local`'s `GRAILS_API_URL` at it
(defaults to `http://localhost:3001` if unset).

## Database and hosting

- ORM/database: **Prisma + PostgreSQL**. Any real Postgres works — Prisma is host-agnostic.
  A free-tier instance (Neon, etc.) or a local Docker container are both fine to bootstrap
  with; the plan is to eventually point `DATABASE_URL` at a proper **AWS RDS** instance —
  zero code changes needed for that swap.
- **Deploying `apps/api` itself in production is not covered by this doc.** It's a
  genuinely separate service from the Vercel-deployed Next.js app and needs its own
  long-running-process hosting (e.g. AWS ECS/Fargate/EC2) — a follow-up decision, not
  blocking the scraper/database pipeline described above.
