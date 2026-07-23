# Running the local demo

The PoC runs against a local Anvil chain with a mock ENSv2-shaped registry (see
`docs/architecture.md` and `contracts/src/mock/`), not real ENSv2 Sepolia — see
`docs/roadmap.md` "Open items" for why.

## 1. Start Anvil

```bash
anvil
```

Leave this running. It prints its 10 default funded accounts and private keys on startup
— these are well-known, public test keys (from the standard "test test test ... junk"
mnemonic), never use them for anything beyond local development.

## 2. Deploy + seed demo data

```bash
cd contracts
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

This deploys `MockENSv2Registry`, `CanonicalIdOrderManager`, and `SubnameLeaseVault`, then
seeds:

| Name | Owner | State |
|---|---|---|
| `alice.eth` | Anvil account 1 | Listed for sale, 0.5 ETH |
| `bob.xyz` | Anvil account 2 | Listed at 1 ETH, then mutated post-listing — **already shows as Suspended with a state diff on first load** |
| `charlie.eth` | Anvil account 3 | Unlisted — available for a live "list your domain" walkthrough |
| `shop.alice.eth` | Anvil account 1 (subname) | Announced for rent, 0.1 ETH / 30 days |
| `blog.alice.eth` | Anvil account 1 (subname) | Already leased to Anvil account 4, ~5 minute term — lets you demo expiry + `reclaim()` without a long wait |

Because Anvil starts from the same fresh state and the deployer always deploys in the same
order, the three contract addresses are identical on every redeploy:

- `MockENSv2Registry`: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- `CanonicalIdOrderManager`: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
- `SubnameLeaseVault`: `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`

These are hardcoded in `apps/demo/lib/contracts.ts`. If you ever deploy in a different
order or add constructor args, re-run and update that file.

## 3. Import test accounts into your wallet

To actually exercise "list as one account, buy as another" in the browser, import a few
of Anvil's default private keys (printed on `anvil` startup, accounts 1-4 are the ones
seeded above) into MetaMask/Rabby/whatever wallet extension you use. Add a network for
chain ID `31337`, RPC `http://127.0.0.1:8545`, if it's not already there — the demo app's
wallet connect flow will also prompt you to switch/add it.

## 4. Run the demo app

```bash
cd apps/demo
pnpm dev
```

Open `http://localhost:3000`, connect a wallet on the Anvil network, and browse `/domains`
and `/subnames`.
