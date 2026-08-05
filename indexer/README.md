# indexer — grant-scope, not in the beta

The beta briefly had a scoped Envio HyperIndex indexer (`apps/indexer`) over its own mock
ENSv2 marketplace contracts, read through `apps/api`; both were removed once the beta
moved to integrating directly with ENS Labs' real ENSv2 alpha registry instead — see
`../docs/ensv2-alpha-integration.md`. The full indexer this folder marks is a wider job:
all ENS name state, market state across marketplaces, search, portfolio, and alerts.
That's grant-scope work, sequenced after the beta — see `../docs/roadmap.md`.

Reference architecture worth studying when this is built: a Fastify API + Viem-based
blockchain indexer + Postgres (WAL-based CDC) + Redis + Elasticsearch microservice split,
as seen in the now-defunct competitor Grails' backend. Not a fork target — Grails' team is
leaving ENS and the code is being studied for its patterns, not reused wholesale.
