# apps/demo

The reference frontend for the PoC demo flows (Slice 1 and Slice 2). Forkable, never the
product — same framing the RFP itself expects: frontend is not a differentiator, the
contracts are.

Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + wagmi/viem + RainbowKit +
`@adraffy/ens-normalize` (ENSIP-15 normalization enforced on every input path — the exact
check OpenSea is documented as skipping).

## Setup

```bash
cp .env.example .env.local   # fill in a WalletConnect project ID + RPC URLs
pnpm install
pnpm dev
```

## Scope

Bare scaffold only at this stage: wallet connect wiring (wagmi + RainbowKit), Sepolia +
mainnet chains configured. No demo flows yet — those land once the corresponding
contracts exist (see `docs/poc-slice-1.md`, `docs/poc-slice-2.md`, `docs/roadmap.md` at
the repo root). Per the product definition, the PoC reads chain state directly — no
indexer, no search, no polish.
