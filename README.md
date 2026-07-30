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
| ENSv2 mock marketplace — canonical-ID orders, regeneration-aware suspend/diff/accept-refill, subname leasing (announce/rent/reclaim) | `contracts/src/v2/`, `contracts/src/mock/` | **Live** — deployed + tested on local Anvil and Sepolia (see Deployed addresses) |
| Real ENSv1 (mainnet) integration — real name/owner/resolver lookups via the ENS subgraph, real active listings from OpenSea and Grails, a real Seaport buy flow using real ETH | `apps/demo/lib/ensv1.ts`, `apps/demo/app/api/ensv1/` | **Live** — reads real mainnet data; purchases are genuine on-chain transactions |
| Demo app — Explore/detail/list pages for both the ENSv2 mock marketplace and real ENSv1 data, Cypress e2e suite | `apps/demo` | **Live** |
| Renewal router (swap-in-any-token, routes to the already-deployed referrer contract) | `contracts/src/v1/` | PoC — mainnet v1, interface-only so far (Slice 2, see `docs/poc-slice-2.md`) |
| v1 core market (listings/offers/registrations, Seaport-based) | `contracts/src/market/` | Stub — grant-scope |
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

# Demo app — against local Anvil (see docs/local-demo.md for the full walkthrough,
# including seeding demo data and running the Cypress suite)
cd apps/demo
cp .env.example .env.local   # fill in a WalletConnect project ID + RPC URLs
pnpm install && pnpm dev
```

The demo app also runs against the real Sepolia deployment below with no local chain
needed — set `NEXT_PUBLIC_SEPOLIA_RPC_URL` and switch your wallet to Sepolia.

## Deployed addresses

### ENSv2 mock marketplace

Our own `MockENSv2Registry` (ERC-1155-style canonical IDs, mutable token IDs that
regenerate on owner/resolver change) — not the real ENSv2 protocol, which isn't live on
any network yet. See `docs/roadmap.md`'s open items for why. Deployed via
`contracts/script/DeployV2Sepolia.s.sol` / `DeployLocal.s.sol` — see `docs/local-demo.md`.

| Contract | Sepolia | Local Anvil |
|---|---|---|
| `MockENSv2Registry` | [`0xabC2fb3Ea33e0eF05146b3e5D85BE901bDDee0d2`](https://sepolia.etherscan.io/address/0xabC2fb3Ea33e0eF05146b3e5D85BE901bDDee0d2) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| `CanonicalIdOrderManager` | [`0xdF913A7a34A232C934A09FE7FF322926CeF14812`](https://sepolia.etherscan.io/address/0xdF913A7a34A232C934A09FE7FF322926CeF14812) | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| `SubnameLeaseVault` | [`0xD35ef25293e63A348CA857EcD46d350b6b0A4B2f`](https://sepolia.etherscan.io/address/0xD35ef25293e63A348CA857EcD46d350b6b0A4B2f) | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |

### Slice 2 (mainnet v1, not yet deployed)

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
