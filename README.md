# ens-marketplace

**A two-sided ENS marketplace, built for the vacuum left by two dead incumbents.**
Vision.io shut down without warning in October 2025, leaving names locked with no
withdrawal path. Grails is winding down in 2026 as its team leaves ENS. Within weeks of
this repo's first commit, no dedicated ENS marketplace exists.

Built by [Bleu](https://bleu.builders) as a bid for the ENS DAO's SPP3 Marketplace RFP.
MIT-licensed — fork it.

## What this is

A domainer-and-buyer marketplace covering the RFP's required scope (listings, offers,
purchases, new registrations, renewals, unified search, OpenSea aggregation) plus two
differentiating bets:

- **A renewal engine with DeFi-native automation** — pay any renewal in any token via
  atomic swap routing, non-custodial auto-renew as signed intents, renew-at-checkout.
- **Subname rental with a rules-based policy engine** — parents rent out subnames with
  rules instead of spreadsheets, backed by a contract that holds the relevant registry
  roles for the lease term so a parent can't revoke mid-lease.

Every contract here is designed to be **non-custodial of funds**, open source, and
forkable — if Bleu ever couldn't run this, someone else could.

## What's in the box

| Component | Path | Status |
|---|---|---|
| Canonical-ID v2 order manager (regeneration-aware validation) | `contracts/src/v2/` | PoC — Sepolia, interfaces only so far |
| Subname lease vault (parent-role delegation for the lease term) | `contracts/src/v2/` | PoC — Sepolia, interfaces only so far |
| Renewal router (swap-in-any-token, routes to existing referrer contract) | `contracts/src/v1/` | PoC — mainnet v1, interfaces only so far |
| v1 core market (listings/offers/registrations, Seaport-based) | `contracts/src/market/` | Stub — grant-scope |
| Demo app | `apps/demo` | Bare scaffold — wallet connect wired, demo flows not yet built |
| Indexer | `indexer/` | Stub — grant-scope |
| SDKs | `sdk/` | Stub — grant-scope |

See `docs/poc-slice-1.md` and `docs/poc-slice-2.md` for the two PoC demo scripts, and
`docs/architecture.md` for why the order and rental contracts are designed the way they
are.

## Quickstart

Prereqs: [Foundry](https://book.getfoundry.sh/), Node 22+, pnpm.

```bash
git clone https://github.com/bleu/ens-marketplace
cd ens-marketplace

# Contracts
cd contracts && forge install && forge build && forge test -vvv && cd ..

# Demo app
cd apps/demo
cp .env.example .env.local   # fill in a WalletConnect project ID + RPC URLs
pnpm install && pnpm dev
```

## Deployed addresses

Not yet deployed — filled in as Sepolia/mainnet deployments happen (see
`docs/roadmap.md`).

| Contract | Network | Address |
|---|---|---|
| `CanonicalIdOrderManager` | Sepolia | _pending_ |
| `SubnameLeaseVault` | Sepolia | _pending_ |
| `RenewalRouter` | Sepolia | _pending_ |
| `RenewalRouter` | Mainnet | _pending_ |

Already-deployed infrastructure this repo calls into rather than redeploys:

| Contract | Network | Address |
|---|---|---|
| [`UniversalRegistrarRenewalWithReferrer`](https://github.com/grailsmarket/ens-referrals) | Mainnet | [`0xf55575Bde5953ee4272d5CE7cdD924c74d8fA81A`](https://etherscan.io/address/0xf55575Bde5953ee4272d5CE7cdD924c74d8fA81A) |
| [`UniversalRegistrarRenewalWithReferrer`](https://github.com/grailsmarket/ens-referrals) | Sepolia | [`0x7AB2947592C280542e680Ba8f08A589009da8644`](https://sepolia.etherscan.io/address/0x7AB2947592C280542e680Ba8f08A589009da8644) |

## Links

- ENS DAO SPP3 Marketplace RFP: https://discuss.ens.domains/t/7-1-social-spp3-marketplace-rfp/22263
- [ENSv2 contracts overview](https://docs.ens.domains/contracts/ensv2/overview)
- [`grailsmarket/ens-referrals`](https://github.com/grailsmarket/ens-referrals) — the
  renewal-referrer contract we route through

## License

MIT — see [LICENSE](LICENSE).
