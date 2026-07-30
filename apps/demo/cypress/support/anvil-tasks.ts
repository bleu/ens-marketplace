import { createPublicClient, createWalletClient, http, parseAbi, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

/// Node-side (not browser-side) helpers for arranging local-Anvil test scenarios directly
/// via raw contract calls — the same pattern contracts/script/DeployLocal.s.sol uses to
/// seed bob.xyz's Suspended state, just driven from Cypress instead of a Forge script.
/// Registered as Cypress tasks (cy.task(...)) so specs can set up a scenario in one line
/// instead of driving every intermediate step through the UI, and so tests stay
/// independent of each other (each spec that mutates state registers its own uniquely-
/// named domain rather than reusing the shared alice/bob/charlie seed data).
///
/// Anvil's default dev accounts are "unlocked": Anvil holds their private keys itself and
/// will sign on their behalf for any eth_sendTransaction naming one as `from` — the same
/// property the browser-side fake wallet (cypress/support/wallet.ts) relies on. These are
/// Anvil's well-known, public "test test ... junk" mnemonic keys — never real funds.
const RPC_URL = "http://127.0.0.1:8545";

const ANVIL_KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  alice: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  bob: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  charlie: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  dave: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
} as const;

export const ANVIL_ADDRESSES = {
  deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  alice: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  bob: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  charlie: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  dave: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
} as const satisfies Record<string, Address>;

// Mirrors apps/demo/lib/contracts.ts's Anvil deployment (same addresses on every fresh
// Anvil + DeployLocal.s.sol run — see docs/local-demo.md).
const REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const ORDER_MANAGER_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as const;
const LEASE_VAULT_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as const;

const registryAbi = parseAbi([
  "function register(string name, address owner_) returns (uint256 canonicalId)",
  "function registerSubname(uint256 parentId, string label, address owner_) returns (uint256 canonicalId)",
  "function setResolver(uint256 canonicalId, address newResolver)",
  "function setRole(uint256 canonicalId, bytes32 role, address account, bool enabled)",
  "function approveTransfer(uint256 canonicalId, address operator)",
  "function SUBNAME_ADMIN_ROLE() view returns (bytes32)",
  "function ownerOf(uint256 canonicalId) view returns (address)",
]);

const orderManagerAbi = parseAbi([
  "function list(uint256 canonicalId, uint256 price) returns (bytes32 pinnedHash)",
  "function orders(uint256 canonicalId) view returns (address seller, uint256 price, bytes32 pinnedHash, address pinnedOwner, address pinnedResolver, uint8 status)",
]);

const leaseVaultAbi = parseAbi(["function announceForRent(uint256 canonicalId, uint256 pricePerTerm, uint256 termSeconds)"]);

type ActorName = keyof typeof ANVIL_KEYS;

function walletFor(actor: ActorName) {
  return createWalletClient({
    account: privateKeyToAccount(ANVIL_KEYS[actor]),
    chain: foundry,
    transport: http(RPC_URL),
  });
}

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC_URL) });

async function waitFor(hash: `0x${string}`) {
  await publicClient.waitForTransactionReceipt({ hash });
}

/// Registers a fresh, uniquely-named domain owned by `actor`, approves the order manager,
/// and lists it at `priceEth` — the "list" half of a list/buy test, without going through
/// the /domains/list UI (that's covered by its own spec; scenario setup here just needs
/// the resulting on-chain state to exist).
async function registerAndList(args: { name: string; actor: ActorName; priceEth: string }): Promise<{ canonicalId: string }> {
  const wallet = walletFor(args.actor);
  const registerHash = await wallet.writeContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "register",
    args: [args.name, wallet.account.address],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
  // Registered(indexed canonicalId, name, indexed owner) — canonicalId is the first
  // indexed topic (topics[0] is the event signature itself).
  const canonicalId = BigInt(receipt.logs[0].topics[1]!);

  const approveHash = await wallet.writeContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "approveTransfer",
    args: [canonicalId, ORDER_MANAGER_ADDRESS],
  });
  await waitFor(approveHash);

  const listHash = await wallet.writeContract({
    address: ORDER_MANAGER_ADDRESS,
    abi: orderManagerAbi,
    functionName: "list",
    args: [canonicalId, parseEther(args.priceEth)],
  });
  await waitFor(listHash);

  return { canonicalId: canonicalId.toString() };
}

/// Simulates an external mutation to a listed name's resolver after listing — exactly
/// what contracts/script/DeployLocal.s.sol does to put bob.xyz into a Suspended state,
/// just parameterized so a spec can do it to its own freshly-listed test name instead of
/// relying on the shared bob.xyz seed data.
async function mutateResolver(args: { canonicalId: string; actor: ActorName; newResolver: Address }) {
  const wallet = walletFor(args.actor);
  const hash = await wallet.writeContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "setResolver",
    args: [BigInt(args.canonicalId), args.newResolver],
  });
  await waitFor(hash);
  return null;
}

/// Registers a fresh subname under an existing parent and announces it for rent — the
/// "announce" half of a rent test.
async function registerSubnameAndAnnounce(args: {
  parentId: string;
  label: string;
  actor: ActorName;
  priceEth: string;
  termSeconds: number;
}): Promise<{ canonicalId: string }> {
  const wallet = walletFor(args.actor);
  const subnameRole = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "SUBNAME_ADMIN_ROLE",
  });

  const registerHash = await wallet.writeContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "registerSubname",
    args: [BigInt(args.parentId), args.label, wallet.account.address],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
  // SubnameRegistered(indexed parentId, indexed canonicalId, label, indexed owner) — the
  // subname's canonicalId is the second indexed topic (topics[0] is the event signature).
  const canonicalId = BigInt(receipt.logs[0].topics[2]!);

  const roleHash = await wallet.writeContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "setRole",
    args: [canonicalId, subnameRole, LEASE_VAULT_ADDRESS, true],
  });
  await waitFor(roleHash);

  const announceHash = await wallet.writeContract({
    address: LEASE_VAULT_ADDRESS,
    abi: leaseVaultAbi,
    functionName: "announceForRent",
    args: [canonicalId, parseEther(args.priceEth), BigInt(args.termSeconds)],
  });
  await waitFor(announceHash);

  return { canonicalId: canonicalId.toString() };
}

/// Reads the registry's actual current owner — the real post-purchase source of truth.
/// Not the same as CanonicalIdOrderManager.orders(id).seller, which is the *original
/// lister* and never updates after a sale (see CanonicalIdOrderManager._settle — only
/// order.status flips to Filled; the registry's owner is what actually transfers).
async function readOwner(canonicalId: string): Promise<string> {
  return publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "ownerOf",
    args: [BigInt(canonicalId)],
  });
}

async function readOrderStatus(canonicalId: string): Promise<number> {
  const order = await publicClient.readContract({
    address: ORDER_MANAGER_ADDRESS,
    abi: orderManagerAbi,
    functionName: "orders",
    args: [BigInt(canonicalId)],
  });
  return order[5];
}

export function registerAnvilTasks(on: Cypress.PluginEvents) {
  on("task", {
    anvilRegisterAndList: registerAndList,
    anvilMutateResolver: mutateResolver,
    anvilRegisterSubnameAndAnnounce: registerSubnameAndAnnounce,
    anvilReadOwner: readOwner,
    anvilReadOrderStatus: readOrderStatus,
  });
}
