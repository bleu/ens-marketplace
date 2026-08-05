# Roadmap

## Beta (current focus)

- **Slice 1** (Sepolia, due for the Aug 5 submission) — see `docs/slice-1.md`.
- **Slice 2** (mainnet v1, due for interviews mid/late Aug) — see `docs/slice-2.md`.

Build sequence (status as of the Aug 5 submission):

1. **Done** — scaffold: repo structure, docs, CI, interface-only contract stubs.
2. **Done** — `CanonicalIdOrderManager` + `StateHash` + regeneration-suspend tests.
3. **Done** — `SubnameLeaseVault` + tests. Highest fund/permission-risk contract in the
   repo; the intent was not to finalize it until ENS Labs confirmed (via the July 29 Q&A
   call) whether there's a canonical pattern for bounded-term registry role delegation.
   Whether that confirmation actually landed isn't recorded anywhere in this repo — treat
   the vault's role-delegation design as unconfirmed against upstream until someone who was
   on the call says otherwise.
4. **Not started** — `RenewalRouter` + `ISwapAdapter`, wired to the already-deployed
   `UniversalRegistrarRenewalWithReferrer` — usable with a mock adapter before the swap
   provider decision lands. Only `ISwapAdapter.sol` and a placeholder test exist today.
5. **Done** — web app wiring against deployed Sepolia contracts, README addresses filled
   in. Went further than planned: the web app now reads through a real indexer
   (`apps/indexer` + `apps/api`, see `docs/ensv2-indexer.md`) rather than scanning chain
   state client-side.
6. **Not started** — flip repo public, tag `v0.1.0-beta`, pre-submission polish.

## Grant scope (post-award, sequenced after the beta)

Following the product definition's MoSCoW: continuity kit + v1 core market
(listings/offers/registrations, Seaport-based) + baseline renewals first (go-live), then
aggregation/portfolio/offers, then the v2 track (v2-native orders at production
hardness, migration center, rental policy engine + auctions) keyed off ENSv2 mainnet
availability rather than calendar dates.

`indexer/` and `sdk/` are stubs and get built out here. The product definition originally scoped the beta to "no indexer, no search, no polish" — reading chain state directly — but that didn't survive contact with real RPC rate limits, so the beta now has a scoped indexer over its own contracts (`apps/indexer` + `apps/api`, see `docs/ensv2-indexer.md`). What `indexer/` still marks is the wider job: all ENS name state, cross-marketplace state, search, portfolio, alerts. `contracts/src/market/` (the Seaport-based v1 core) is grant-scope for the same reason.

## Open items requiring external research/confirmation

1. Exact ENSv2 Sepolia addresses for the Registry / `PermissionedRegistry` /
   `RegistryDatastore` contracts (only the Universal Resolver proxy
   `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` per ENSIP-23 is confirmed stable).
2. Exact event name/signature ENSv2 emits on token/role regeneration, and exact role
   names — needed for `StateHash`'s field selection.
3. Precise canonical-ID derivation reference/ENSIP.
4. Whether `UniversalRegistrarRenewalWithReferrer`'s `referrer` bytes32 needs registration
   with NameHash/ENS Labs, or is self-assigned permissionlessly.
5. Whether ENS Labs has a canonical pattern for bounded-term registry role delegation —
   on the agenda for the July 29 Q&A call.
6. Swap/intent provider selection for Slice 2 (CoW Protocol is the strong internal
   candidate — see `docs/slice-2.md`).
