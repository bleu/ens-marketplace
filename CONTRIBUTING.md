# Contributing

## Dev setup

**Contracts** (Foundry):

```bash
cd contracts
forge install
forge build
forge test -vvv
```

**Demo app** (Next.js, pnpm workspace):

```bash
cd apps/demo
cp .env.example .env.local   # fill in a WalletConnect project ID + RPC URLs
pnpm install
pnpm dev
```

## Branching / commits

GitHub-flow: short-lived feature branches off `main`, PRs require green CI to merge. No
long-running release branches.

Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, …) so history stays scannable.

## Before opening a PR

- `forge fmt --check` and `forge test` pass in `contracts/`.
- `pnpm lint` and `pnpm build` pass in `apps/demo`.
- New contracts touching fund or permission safety (anything under `contracts/src/v2` or
  `contracts/src/v1`) should reference the relevant section of `docs/architecture.md` in
  the PR description, and add tests for the specific invariant being changed.
