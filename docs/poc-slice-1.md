# PoC Slice 1 — ENSv2 on Sepolia

Target: ready for the Aug 5, 2026 submission.

## Demo script

1. Register a v2 name on Sepolia.
2. List it via `CanonicalIdOrderManager`, keyed on the name's canonical ID. The order pins
   a state hash (owner, resolver) at listing time.
3. Buy it — a straightforward fill against unchanged state.
4. **Trigger a role/resolver change** on a second listed name (simulating a seller
   mutating the name after listing). Show the order transition to **Suspended** rather than
   silently remaining fillable.
5. Show the state diff the suspended order surfaces, and an explicit, informed re-fill
   once the diff is accepted — or a clean re-listing by the seller instead.
6. Mint a subname and rent it via `SubnameLeaseVault` at a fixed price/term, with automatic
   return-to-parent on expiry.

Step 4–5 is the corrected version of the original demo idea ("show the order surviving a
role change") — see `docs/architecture.md` for why regeneration-**aware**, not
regeneration-**surviving**, is the actual design goal. An order that blindly survived a
role change would reintroduce the exact vulnerability ENSv2's token regeneration is meant
to prevent.

## Status

Implemented and deployed — `CanonicalIdOrderManager` and `SubnameLeaseVault` are live on Sepolia (addresses in the root `README.md`), with the full script above (list → buy → mutate → suspend → diff → accept-refill, plus subname rent/reclaim) working end-to-end and covered by the Foundry test suite. It used to have Cypress coverage too, driving real transactions against a local chain; those specs went with the local chain itself and haven't been ported to Sepolia.
This is our own `MockENSv2Registry`, not the real ENSv2 protocol — see `docs/roadmap.md`'s
open items for why real ENSv2 Sepolia addresses/events/roles are still unconfirmed
upstream.
