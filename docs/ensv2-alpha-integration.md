# Real ENSv2 Sepolia alpha integration

A user found a live contract (`0x8c2e866b439358c41ae05de9cbe8a00bfefaffca`) while browsing
the real **ENS App Alpha** (`sepolia.app.ens.domains` / `app.ens.dev`) — ENS Labs' own first
application built against real ENSv2 contracts. This doc records what it actually is, how
that was confirmed, and the caveats that come with depending on it.

## What this is

**Not our own `MockENSv2Registry`.** It's ENS Labs' real `ETHRegistrar`, from their
`ensdomains/contracts-v2` monorepo — confirmed by extracting every function selector from
the deployed bytecode and cross-referencing them against that repo's committed
`contracts/deployments/sepolia/ETHRegistrar.json` ABI: **22 of 32 selectors matched
exactly**, including distinctive ones like `GRACE_PERIOD()`, `MIN_COMMITMENT_AGE()`, and the
real (non-ENSv1) `register(string,address,bytes32,address,address,uint64,address,bytes32)`
signature.

Live `eth_call`s against it resolved the rest of its real graph:

| Contract | Address | Role |
|---|---|---|
| `ETHRegistrar` | `0x8c2e866b439358c41ae05de9cbe8a00bfefaffca` | commit-reveal registration/renewal |
| `ETHRegistry` | `0xdedb92913a25abe1f7bcdd85d8a344a43b398b67` | ERC-1155-style per-name registry |
| `StandardRentPriceOracle` | `0xe19d37839f42f7d2694d8c5712f412c66a218161` | pricing, denominated in a supported ERC-20 |
| Payment token (symbol `USDC`, 6 decimals, public `mint(uint256)`) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | what `register`/`renew` are actually paid in |

## How the payment token was found

`getRegisterPrice`/`register` take a `paymentToken` address, and revert with
`PaymentTokenNotSupported(address)` for anything the price oracle hasn't been configured to
accept. The `MockUSDC`/`MockDAI` addresses committed in `ensdomains/contracts-v2` **both
revert** against this specific oracle instance. The actual accepted token
(`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`) was found by scanning the oracle's
`PaymentTokenUpdated` event log and confirmed via `isPaymentToken(address) == true` plus
reading its `symbol()`/`decimals()`. It has no known public faucet UI, hence the in-app
"mint test USDC" affordance on the register page.

## Deployment timing — this is a very recent, unpublished redeploy

Binary-searching `eth_getCode` across historical blocks (a purely on-chain technique — no
explorer needed) pinned this exact contract's deployment to **block 11382925**, and
cross-referencing that against the chain's timestamp puts it on **2026-07-30** — the same
day it was found. That **postdates** the "Post Audit Changes" commit in
`ensdomains/contracts-v2` (2026-07-03), whose committed `ETHRegistrar` address
(`0xa4449a0dd2b83007553d9b1d28b583a46a805a30`) is a completely different contract (different
bytecode, different linked `ETHRegistry`/oracle) from the one documented here.

**Takeaway: ENS Labs redeploys this alpha stack frequently, without publishing addresses
anywhere** (not in `docs.ens.domains`, not in the `ensdomains/contracts-v2` repo as of this
writing, not in any ENS forum post checked). Every address in this document should be
treated as liable to go stale on short notice. This is not our own MockENSv2Registry's
stability guarantee — do not assume these addresses still work without re-verifying first
(the same bytecode/selector-matching technique used to find them in the first place).

## What our own architecture predicted correctly

The real `ETHRegistry` has a `TokenRegenerated(uint256 oldTokenId, uint256 newTokenId)`
event and `getState()`/`getStatus()` — a resolver/owner mutation that requires regeneration
retires the old token ID entirely rather than leaving it silently valid. This is exactly the
mechanic our own `CanonicalIdOrderManager`'s suspend-on-mutation design
(`docs/poc-slice-1.md`'s "regeneration-aware, not regeneration-surviving") was built around
speculatively, before this real contract was found. It isn't identical (our own scheme pins
an order to a state hash and flags it Suspended; the real registry regenerates the token ID
itself), but the underlying thesis — that ENSv2 mutation must be actively detected, not
silently survived — matches what ENS actually shipped.

## What this integration does and doesn't do

- **Does**: a real commit-reveal registration flow (`apps/demo/app/domains/ensv2-alpha/register`)
  and a real name detail/activity view (`apps/demo/app/domains/ensv2-alpha/[label]`) against
  the live contracts above, reachable via a third "Real ENSv2 (Sepolia Alpha)" mode on
  `/domains` (see `apps/demo/lib/network-mode.tsx`, `apps/demo/lib/ensv2-alpha.ts`).
- **Does not** wire our own `CanonicalIdOrderManager`/buy-sell marketplace against the real
  `ETHRegistry` — that would mean deploying our own contracts against a third party's live,
  unaudited, unstable alpha registry, which isn't warranted yet. Tracked as future work under
  Linear issue `BLEUDEV-237` ("Design real ENSv2 mainnet migration path").
- **Does not** get CI/Cypress coverage — the write flow spends real (test) Sepolia
  ETH/USDC and depends on a third party's live, frequently-redeployed testnet infrastructure.
  Manual QA only.
