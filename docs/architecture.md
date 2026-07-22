# Architecture

This repo is the PoC + eventual production submission for Bleu's bid on the ENS DAO SPP3
Marketplace RFP. Two design decisions distinguish this marketplace from static
Seaport/OpenSea-style listings, and are load-bearing enough to document here rather than
leave implicit in code comments.

## Regeneration-aware order validation (`contracts/src/v2`)

ENSv2 deliberately mutates a name's token ID whenever its role or resolver state changes —
this is the mechanism that replaces v1's exploitable "swap the resolver after listing"
pattern. A marketplace order keyed on a name's stable **canonical ID** therefore cannot
simply keep filling across a token regeneration event; doing so would silently reintroduce
the exact scam ENSv2 was designed to prevent (a seller lists a clean name, mutates its
role/resolver state, and a naively "regeneration-surviving" order still fills against the
new, unreviewed state).

`CanonicalIdOrderManager` is designed to be **regeneration-aware**, not
regeneration-surviving:

- At listing time, the order pins a hash of the buyer-relevant state (owner, resolver, and
  the ENSv2 roles that matter for a "clean" listing) via `StateHash`.
- At fill time, the current state is re-hashed and compared against the pinned hash.
- A mismatch **suspends** the order rather than allowing it to fill. Un-suspending requires
  either a fresh listing with new pinned state, or an explicit buyer-visible state diff and
  informed re-fill.

This is the actual moat over static listings: the order tracks whether the thing being sold
is still the thing that was listed, not whether the listing transaction itself is still
valid.

## Rental permission delegation (`contracts/src/v2`)

ENSv2 parents retain the ability to delete, reassign, or revoke subtrees at any time — a
rental product built only on "the lease expires on schedule" leaves the renter with no
protection against a parent revoking mid-lease.

`SubnameLeaseVault` is designed so the parent delegates the specific registry roles needed
to manage a subname (not fund custody — role management only) to the vault contract for
the bounded lease term. While a lease is active, the vault is the only entity that can
action a revoke or reassignment; roles revert to the parent automatically on lease
expiry. In other words: **never custody assets or funds — custody permissions, and only
under open-source, non-custodial contract rules, for a term the lease itself defines.**

## Non-custodial by construction

Both contracts follow the same underlying principle as the rest of this repo's design: no
contract here ever takes custody of a name, of ETH, or of any token beyond what a single
atomic settlement transaction requires. Everything is open source, and every contract is
built so a fork of this repo, by anyone, could keep the underlying market running if Bleu
could not.
