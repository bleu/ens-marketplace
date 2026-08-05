# Slice 2 — automated renewal on mainnet v1

Target: ready for interviews, mid/late Aug 2026.

## Demo script

1. Pick a real, live v1 `.eth` name approaching expiry.
2. Renew it through `RenewalRouter`, paying in an arbitrary ERC-20 token.
3. `RenewalRouter` calls `ISwapAdapter` to convert the input token into the ETH the
   renewal costs, then calls the already-deployed
   [`UniversalRegistrarRenewalWithReferrer`](https://github.com/grailsmarket/ens-referrals)
   contract directly — mainnet `0xf55575Bde5953ee4272d5CE7cdD924c74d8fA81A` — with Bleu's
   referrer attached.
4. Show the `RenewalReferred` event on-chain, attributing the renewal to Bleu.

We deliberately do not reimplement referrer-based attribution: `ens-referrals` is a
NameHash Labs project built in coordination with the ENS Labs team, already live on
mainnet and Sepolia, MIT-licensed. Routing through it directly is both less work and a
stronger attribution story than a bespoke contract, since it's infrastructure the
committee already recognizes.

## Swap/intent provider

Deliberately undecided — `ISwapAdapter` is a provider-agnostic boundary interface so this
can be resolved without changing `RenewalRouter`. CoW Protocol is a strong internal
candidate given Bleu's existing tooling investment (`composable-cow`, `cowswap`,
`cow-sdk`, `cowprotocol-services`, and more), and is also the natural fit for the later
non-custodial auto-renew bet (conditional orders). Not hardcoded here — see
`docs/roadmap.md` open items.

## Status

Not yet implemented — `contracts/src/v1/ISwapAdapter.sol` is an interface stub only, and
`contracts/src/v1/adapters/` is empty pending the provider decision.
