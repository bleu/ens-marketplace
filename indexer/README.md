# indexer — grant-scope, not in the beta

The beta indexes only its own ENSv2 marketplace contracts, via `apps/indexer` (Envio
HyperIndex) read through `apps/api` — see `../docs/ensv2-indexer.md`. The full indexer this
folder marks is a wider job: all ENS name state, market state across marketplaces, search,
portfolio, and alerts. That's grant-scope work, sequenced after the beta — see
`../docs/roadmap.md`.

Reference architecture worth studying when this is built: a Fastify API + Viem-based
blockchain indexer + Postgres (WAL-based CDC) + Redis + Elasticsearch microservice split,
as seen in the now-defunct competitor Grails' backend. Not a fork target — Grails' team is
leaving ENS and the code is being studied for its patterns, not reused wholesale.
