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
| ENSv2 mock marketplace — canonical-ID orders, regeneration-aware suspend/diff/accept-refill, subname leasing (announce/rent/reclaim) | `contracts/src/v2/`, `contracts/src/mock/` | **Live** — deployed + tested on local Anvil and Sepolia (see Deployed addresses) |
| Real ENSv1 (mainnet) integration — real name/owner/resolver lookups via the ENS subgraph, real active listings from OpenSea and Grails, a real Seaport buy flow using real ETH | `apps/web/lib/ensv1.ts`, `apps/web/app/api/ensv1/` | **Live** — reads real mainnet data; purchases are genuine on-chain transactions |
| Real ENSv2 Sepolia alpha integration — commit-reveal registration and a name detail/activity view against ENS Labs' own alpha contracts | `apps/web/lib/ensv2-alpha.ts`, `apps/web/app/domains/ensv2-alpha/` | **Live** — see `docs/ensv2-alpha-integration.md` for what those contracts are and the caveats |
| Web app — Explore/detail/list pages for the ENSv2 mock marketplace, real ENSv1 data, and the ENSv2 alpha; subname browse/register; Cypress e2e suite | `apps/web` | **Live** |
| Marketplace indexer + read API — Envio HyperIndex over our own ENSv2 contracts, served to the web app as REST by a NestJS service | `apps/indexer`, `apps/api` | **Live** — see `docs/ensv2-indexer.md` |
| Grails listing scraper + database — keeps mainnet Grails listings reachable ahead of that API's discontinuation | `apps/api/src/scraper/`, `apps/api/src/grails/` | **Live** — see `docs/grails-migration.md` |
| Renewal router (swap-in-any-token, routes to the already-deployed referrer contract) | `contracts/src/v1/` | Not written — only `ISwapAdapter.sol` (the swap-provider boundary) and a placeholder test exist. Slice 2, see `docs/slice-2.md` |
| v1 core market (listings/offers/registrations, Seaport-based) | `contracts/src/market/` | Stub — grant-scope, README only |
| Full indexer across all of ENS (name state, cross-marketplace state, search, portfolio, alerts) | `indexer/` | Stub — grant-scope, README only |
| SDKs | `sdk/` | Stub — grant-scope, README only |

See `docs/slice-1.md` and `docs/slice-2.md` for the two demo scripts, and
`docs/architecture.md` for why the order and rental contracts are designed the way they
are.

## What's real today

Worth being blunt about, because "live on Sepolia" can be read as more than it is.

The marketplace contracts on Sepolia are real, deployed, and Etherscan-verified. The registry underneath them is **our own `MockENSv2Registry`**, not the real ENSv2 registry. That's not a shortcut we'd keep — it's forced by three things still unconfirmed upstream (`docs/roadmap.md`, open items 1 to 3): ENSv2's Sepolia registry addresses aren't published, the token/role regeneration event signature isn't pinned down, and there's no canonical reference for canonical-ID derivation. `StateHash`'s field selection depends on the second one, so building against a guess would mean rebuilding it.

Where the code does touch real ENS, it touches it for real. ENSv1 on mainnet is live data and genuine on-chain purchases through Seaport. The ENSv2 alpha pages talk to ENS Labs' own alpha contracts on Sepolia, with real commit-reveal registration paid in a real ERC-20 — see `docs/ensv2-alpha-integration.md` for how those addresses were confirmed and what depending on an alpha costs you.

Not yet written: `RenewalRouter` (Slice 2), and everything marked grant-scope above.

## Quickstart

Prereqs: [Foundry](https://book.getfoundry.sh/), Node 22+, pnpm.

```bash
git clone https://github.com/bleu/ens-marketplace
cd ens-marketplace

# Contracts
cd contracts && forge install && forge build && forge test -vvv && cd ..

# Web app — against local Anvil (see docs/local-dev.md for the full walkthrough,
# including seeding demo data and running the Cypress suite)
cd apps/web
cp .env.example .env.local   # fill in a WalletConnect project ID + RPC URLs
pnpm install && pnpm dev
```

The web app also runs against the real Sepolia deployment below with no local chain
needed — set `NEXT_PUBLIC_SEPOLIA_RPC_URL` and switch your wallet to Sepolia.

## Deployed addresses

### ENSv2 mock marketplace

Our own `MockENSv2Registry` (ERC-1155-style canonical IDs, mutable token IDs that
regenerate on owner/resolver change) — not the real ENSv2 protocol, which isn't live on
any network yet. See `docs/roadmap.md`'s open items for why. Deployed via
`contracts/script/DeployV2Sepolia.s.sol` / `DeployLocal.s.sol` — see `docs/local-dev.md`.

| Contract | Sepolia | Local Anvil |
|---|---|---|
| `MockENSv2Registry` | [`0xabC2fb3Ea33e0eF05146b3e5D85BE901bDDee0d2`](https://sepolia.etherscan.io/address/0xabC2fb3Ea33e0eF05146b3e5D85BE901bDDee0d2) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| `CanonicalIdOrderManager` | [`0xdF913A7a34A232C934A09FE7FF322926CeF14812`](https://sepolia.etherscan.io/address/0xdF913A7a34A232C934A09FE7FF322926CeF14812) | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| `SubnameLeaseVault` | [`0xD35ef25293e63A348CA857EcD46d350b6b0A4B2f`](https://sepolia.etherscan.io/address/0xD35ef25293e63A348CA857EcD46d350b6b0A4B2f) | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |

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
