# Roadmap

## PoC (this repo's current focus)

- **Slice 1** (Sepolia, due for the Aug 5 submission) — see `docs/poc-slice-1.md`.
- **Slice 2** (mainnet v1, due for interviews mid/late Aug) — see `docs/poc-slice-2.md`.

Build sequence:

1. Scaffold (this session) — repo structure, docs, CI, interface-only contract stubs.
2. `CanonicalIdOrderManager` + `StateHash` + regeneration-suspend tests.
3. `SubnameLeaseVault` + tests — highest fund/permission-risk contract in the repo; ideally
   not finalized until ENS Labs confirms (via the July 29 Q&A call) whether there's a
   canonical pattern for bounded-term registry role delegation.
4. `RenewalRouter` + `ISwapAdapter`, wired to the already-deployed
   `UniversalRegistrarRenewalWithReferrer` — usable with a mock adapter before the swap
   provider decision lands.
5. Demo app wiring against deployed Sepolia contracts, README addresses filled in.
6. Flip repo public, tag `v0.1.0-poc`, pre-submission polish.

## Grant scope (post-award, sequenced after the PoC)

Following the product definition's MoSCoW: continuity kit + v1 core market
(listings/offers/registrations, Seaport-based) + baseline renewals first (go-live), then
aggregation/portfolio/offers, then the v2 track (v2-native orders at production
hardness, migration center, rental policy engine + auctions) keyed off ENSv2 mainnet
availability rather than calendar dates.

`indexer/` and `sdk/` are stubbed at PoC stage (the PoC reads chain state directly — no
indexer, no search, no polish, per the product definition) and get built out here.
`contracts/src/market/` (the Seaport-based v1 core) is grant-scope for the same reason.

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
   candidate — see `docs/poc-slice-2.md` and the kept feature set in
   `docs/cow-automation.md`).
