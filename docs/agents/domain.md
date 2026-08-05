# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (single-context repo — no `CONTEXT-MAP.md` here).
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a single-context repo, even though it's a pnpm monorepo (`apps/`, `contracts/`, `indexer/`, `sdk/`) — all packages serve one product and share one domain language:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-....md
│   └── 0002-....md
├── apps/
├── contracts/
├── indexer/
└── sdk/
```

If the contexts ever diverge (e.g. contracts vocabulary splits from app vocabulary), introduce `CONTEXT-MAP.md` at the root then — not before.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Edit ADRs on conflict

This is a fast-moving beta, so decisions are fragile by design. If your output contradicts an existing ADR, don't just flag the contradiction — edit the ADR directly to record the new decision: update its status (superseded/amended), state what changed and why, and keep the old reasoning in place for the record. Then mention in your output which ADR you changed, so a human can review the edit rather than discover it later.
