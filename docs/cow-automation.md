# CoW-based automation features

Outcome of the July 28, 2026 brainstorm on using CoW Protocol (hooks + composable-cow
conditional orders) as the automation layer behind the renewal engine. Three features
kept, in priority order. Options considered and dropped: seller-side proceeds
conversion and rental-income conversion (both are just swaps the user could do
themselves), wallet-funded standing offers (elegant funding mechanism, but accept
latency through the orderbook undercuts one-click accept — may revisit for S1/S2).

Two CoW primitives shape everything below:

- **Hooks** run arbitrary calls around a swap, best-effort: a reverting post-hook does
  not revert the settlement, the user just ends up holding the bought token. Safe when
  the hooked action is retryable (renew), risky when it's a race (a specific listing).
- **Composable-cow conditional orders** are signed once, keep funds in the user's
  wallet, and are posted to the orderbook by a watchtower when an on-chain condition
  turns true. This is the actual automation primitive; cancellable anytime.

## 1. Auto-renew in any token (M5/M6 — the killer feature)

A conditional order: "whenever any name in my set drops below N days to expiry, sell my
USDC for ETH and renew it through the referrer contract." Signed once, non-custodial,
cancellable. Everything lines up with no mechanism friction: `renew()` is permissionless
so the hook needs no ownership, renewal cost is deterministic so the swap sizes cleanly,
a failed hook leaves retryable WETH rather than a stuck state, and every fire emits a
`RenewalReferred` event attributed to Bleu — the 35%-of-rubric revenue metric.

Target: PoC slice 2. The `ISwapAdapter` boundary becomes a CoW conditional-order
handler rather than a plain swap adapter.

## 2. Premium-decay snipe orders (S3)

A resting limit order on a lapsed name: "buy `name.eth` when its decaying premium hits
0.5 ETH, paid from my DAI." The conditional order validates when the on-chain premium
crosses the target; the swap converts to ETH and a hook registers the name. Wrinkle:
registration is commit-reveal, so a keeper (watchtower or backend) submits the cheap
commit tx shortly before the order goes live and the hook performs the reveal.

Framing with #1: both are *resting orders on ENS names* — auto-renew fires on your own
names' expiry, a snipe fires on someone else's lapsed name hitting your price. Same
infrastructure (composable-cow + watchtower + one periphery handler), two stories.

Target: grant scope, fast-follow after #1 proves the primitive.

## 3. Pay-with-anything checkout (M5 renew-at-checkout + purchases)

One CoW order sells the buyer's token for WETH with a post-hook filling the Seaport
listing, optionally chaining a multi-year renewal hook (renew-at-checkout). Caveats to
design around: settlement takes a minute or two, the listing can be filled by someone
else in that window, and a failed hook strands the buyer with WETH instead of the name.
Needs UX care — offer only on non-hot names, with an auto-refund path.

Target: grant scope.
