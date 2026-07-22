# indexer — grant-scope, not PoC

The PoC reads chain state directly ("no indexer, no search, no polish" per the product
definition). A full indexer (name state, market state, search, portfolio, alerts) is
grant-scope work, sequenced after the PoC — see `../docs/roadmap.md`.

Reference architecture worth studying when this is built: a Fastify API + Viem-based
blockchain indexer + Postgres (WAL-based CDC) + Redis + Elasticsearch microservice split,
as seen in the now-defunct competitor Grails' backend. Not a fork target — Grails' team is
leaving ENS and the code is being studied for its patterns, not reused wholesale.
