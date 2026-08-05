# Farol

**An ENS marketplace built to outlast whoever runs it.**

Farol is Portuguese for lighthouse: publicly funded infrastructure that stays lit so nobody wrecks, operated on behalf of everyone rather than owned by whoever passes through, and it never touches the cargo.

A two-sided ENS marketplace, built for the vacuum left by two dead incumbents.
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
| ENSv1 (mainnet) integration — name/owner/resolver lookups via the ENS subgraph, active listings from OpenSea and Grails, a Seaport buy flow spending mainnet ETH | `apps/web/lib/ensv1.ts`, `apps/web/app/api/ensv1/` | **Live** — reads live mainnet data; purchases are genuine on-chain transactions |
| ENSv2 Sepolia alpha integration — commit-reveal registration and a name detail/activity view against ENS Labs' own alpha contracts | `apps/web/lib/ensv2-alpha.ts`, `apps/web/app/domains/ensv2-alpha/` | **Live** — see `docs/ensv2-alpha-integration.md` for what those contracts are and the caveats |
| Web app — Explore/detail pages for mainnet ENSv1 data and the ENSv2 alpha; Cypress e2e suite | `apps/web` | **Live** |
| Grails listing scraper + database — keeps mainnet Grails listings reachable ahead of that API's discontinuation | `apps/api/src/scraper/`, `apps/api/src/grails/` | **Live** — see `docs/grails-migration.md` |
| Renewal router (swap-in-any-token, routes to the already-deployed referrer contract) | `contracts/src/v1/` | Not written — only `ISwapAdapter.sol` (the swap-provider boundary), a skeleton deploy script, and a placeholder test exist. Slice 2, see `docs/slice-2.md` |
| v1 core market (listings/offers/registrations, Seaport-based) | `contracts/src/market/` | Stub — grant-scope, README only |
| Full indexer across all of ENS (name state, cross-marketplace state, search, portfolio, alerts) | `indexer/` | Stub — grant-scope, README only |
| SDKs | `sdk/` | Stub — grant-scope, README only |

See `docs/slice-1.md` and `docs/slice-2.md` for the two demo scripts, and
`docs/architecture.md` for the design rationale behind the order/rental invariants a real
ENSv2 marketplace contract needs.

## What you're actually looking at

Everywhere the app touches ENS proper, it touches production. ENSv1 on mainnet is live data, and a purchase is a genuine on-chain transaction through Seaport spending mainnet ETH. The ENSv2 alpha pages talk to ENS Labs' own alpha contracts on Sepolia, with commit-reveal registration paid in an ERC-20 — see `docs/ensv2-alpha-integration.md` for how those addresses were confirmed and what depending on a pre-audit alpha costs you.

Not yet written: `RenewalRouter` (Slice 2), and everything marked grant-scope above.

## Quickstart

Prereqs: [Foundry](https://book.getfoundry.sh/), Node 22+, pnpm.

```bash
git clone https://github.com/bleu/ens-marketplace
cd ens-marketplace

# Contracts
cd contracts && forge install && forge build && forge test -vvv && cd ..

# Web app
cd apps/web && pnpm install && pnpm dev
```

The web app needs no configuration and no wallet to be useful: mainnet is its default chain, so `/domains` opens on the read-only ENSv1 view immediately. Connect a wallet on Sepolia to reach the ENSv2 alpha below. See `apps/web/README.md` for the optional env vars (API keys, dedicated RPC URLs) and what you lose without each one.

## Deployed addresses

### Slice 2 (mainnet v1, not written yet)

| Contract | Network | Address |
|---|---|---|
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
