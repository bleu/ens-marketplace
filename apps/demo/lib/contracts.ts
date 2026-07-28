"use client";

import { keccak256, parseAbi, toBytes } from "viem";
import { useChainId } from "wagmi";
import { foundry, mainnet, sepolia } from "wagmi/chains";

/// Chains this marketplace's contracts are (or will be) deployed to.
export enum Network {
  Anvil = "anvil",
  Sepolia = "sepolia",
  Mainnet = "mainnet",
}

const CHAIN_ID_TO_NETWORK: Record<number, Network> = {
  [foundry.id]: Network.Anvil,
  [sepolia.id]: Network.Sepolia,
  [mainnet.id]: Network.Mainnet,
};

/// Networks with contracts actually deployed today — used by ChainGuard to decide which
/// chains a connected wallet is allowed to be on. Mainnet is a known Network (so
/// `getContractAddresses` can name it in errors/fallbacks) but isn't deployed yet
/// (Slice 2, see docs/roadmap.md), so it's deliberately excluded here.
export const SUPPORTED_NETWORKS = [Network.Anvil, Network.Sepolia] as const;

interface ContractAddresses {
  registry: `0x${string}`;
  orderManager: `0x${string}`;
  leaseVault: `0x${string}`;
  /// Block these contracts were deployed at — event scans (see lib/events.ts) start here
  /// instead of block 0. On Anvil that's a no-op (0n either way), but on a real chain like
  /// Sepolia scanning from genesis hits `eth_getLogs`' block-range limit on public RPCs
  /// (thirdweb's default endpoint caps it at 10,000 blocks) long before it ever reaches
  /// blocks that could contain our events.
  fromBlock: bigint;
}

/// Per-network deployed addresses.
/// - Anvil: from `contracts/script/DeployLocal.s.sol` — identical on every redeploy since
///   Anvil starts fresh and the deployer's nonce order never changes. See docs/local-demo.md.
/// - Sepolia: from `contracts/script/DeployV2Sepolia.s.sol` (deployed + verified on
///   Etherscan 2026-07-28, block 11371094). This is our own MockENSv2Registry, not the
///   real ENSv2 registry — see docs/roadmap.md's open items for why.
/// - Mainnet: not deployed yet (Slice 2) — intentionally absent from this map.
const ADDRESSES: Partial<Record<Network, ContractAddresses>> = {
  [Network.Anvil]: {
    registry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    orderManager: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    leaseVault: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    fromBlock: 0n,
  },
  [Network.Sepolia]: {
    registry: "0xabC2fb3Ea33e0eF05146b3e5D85BE901bDDee0d2",
    orderManager: "0xdF913A7a34A232C934A09FE7FF322926CeF14812",
    leaseVault: "0xD35ef25293e63A348CA857EcD46d350b6b0A4B2f",
    fromBlock: 11371094n,
  },
};

/// Resolves the deployed addresses for `chainId`, falling back to Anvil for any chain
/// without a deployment (e.g. mainnet, or a chain outside `wagmiConfig` entirely) rather
/// than throwing — ChainGuard is what tells the user to switch chains, not a page crash.
export function getContractAddresses(chainId: number): ContractAddresses {
  const network = CHAIN_ID_TO_NETWORK[chainId];
  return (network && ADDRESSES[network]) || ADDRESSES[Network.Anvil]!;
}

/// Resolves the three marketplace contract addresses for whatever chain the connected
/// wallet is on — Anvil (wagmiConfig's default chain) before a wallet connects.
export function useContractAddresses(): ContractAddresses {
  const chainId = useChainId();
  return getContractAddresses(chainId);
}

/// Which network's contracts are currently being read/written — for display copy that
/// needs to name the actual network rather than assuming local Anvil (e.g. the registry
/// detail row on /domains/[canonicalId] and /subnames/[canonicalId]).
export function useCurrentNetwork(): Network {
  const chainId = useChainId();
  return CHAIN_ID_TO_NETWORK[chainId] ?? Network.Anvil;
}

/// Mirrors the identical `SUBNAME_ADMIN_ROLE` constant defined in both
/// MockENSv2Registry.sol and SubnameLeaseVault.sol — computed client-side rather than
/// read from chain, since it's a compile-time constant.
export const SUBNAME_ADMIN_ROLE = keccak256(toBytes("ENSv2Marketplace.SUBNAME_ADMIN_ROLE"));

// Only the functions/events the frontend actually calls or reads — not full ABIs.

export const registryAbi = parseAbi([
  "function ownerOf(uint256 canonicalId) view returns (address)",
  "function resolverOf(uint256 canonicalId) view returns (address)",
  "function hasRole(uint256 canonicalId, bytes32 role, address account) view returns (bool)",
  "function nameOf(uint256 canonicalId) view returns (string)",
  "function parentOf(uint256 canonicalId) view returns (uint256)",
  "function transferApproval(uint256 canonicalId) view returns (address)",
  "function SUBNAME_ADMIN_ROLE() view returns (bytes32)",
  "function register(string name, address owner_) returns (uint256 canonicalId)",
  "function registerSubname(uint256 parentId, string label, address owner_) returns (uint256 canonicalId)",
  "function setResolver(uint256 canonicalId, address newResolver)",
  "function setRole(uint256 canonicalId, bytes32 role, address account, bool enabled)",
  "function approveTransfer(uint256 canonicalId, address operator)",
  "event Registered(uint256 indexed canonicalId, string name, address indexed owner)",
  "event SubnameRegistered(uint256 indexed parentId, uint256 indexed canonicalId, string label, address indexed owner)",
  "event ResolverChanged(uint256 indexed canonicalId, address indexed newResolver, uint96 newVersion)",
  "event OwnerChanged(uint256 indexed canonicalId, address indexed newOwner, uint96 newVersion)",
  "event RoleUpdated(uint256 indexed canonicalId, bytes32 indexed role, address indexed account, bool enabled)",
]);

export const orderManagerAbi = parseAbi([
  "function orders(uint256 canonicalId) view returns (address seller, uint256 price, bytes32 pinnedHash, address pinnedOwner, address pinnedResolver, uint8 status)",
  "function list(uint256 canonicalId, uint256 price) returns (bytes32 pinnedHash)",
  "function relist(uint256 canonicalId, uint256 newPrice)",
  "function cancel(uint256 canonicalId)",
  "function buy(uint256 canonicalId) payable",
  "function diff(uint256 canonicalId) view returns (address pinnedOwner, address pinnedResolver, address liveOwner, address liveResolver, bool mismatched)",
  "function acceptDiffAndRefill(uint256 canonicalId, bytes32 expectedLiveHash) payable",
  "event Listed(uint256 indexed canonicalId, address indexed seller, uint256 price, bytes32 pinnedHash)",
  "event Relisted(uint256 indexed canonicalId, uint256 newPrice, bytes32 pinnedHash)",
  "event Cancelled(uint256 indexed canonicalId)",
  "event Filled(uint256 indexed canonicalId, address indexed buyer, uint256 price)",
  "event OrderSuspended(uint256 indexed canonicalId, bytes32 pinnedHash, bytes32 liveHash)",
  "event Refilled(uint256 indexed canonicalId, address indexed buyer, uint256 price)",
]);

export const leaseVaultAbi = parseAbi([
  "function listings(uint256 canonicalId) view returns (address parent, uint256 pricePerTerm, uint256 termSeconds, bool active)",
  "function leaseActiveUntil(uint256 canonicalId) view returns (uint256)",
  "function tenantOf(uint256 canonicalId) view returns (address)",
  "function parentOf(uint256 canonicalId) view returns (address)",
  "function SUBNAME_ADMIN_ROLE() view returns (bytes32)",
  "function announceForRent(uint256 canonicalId, uint256 pricePerTerm, uint256 termSeconds)",
  "function withdraw(uint256 canonicalId)",
  "function rent(uint256 canonicalId) payable",
  "function setLeasedResolver(uint256 canonicalId, address newResolver)",
  "function reclaim(uint256 canonicalId)",
  "event Announced(uint256 indexed canonicalId, address indexed parent, uint256 pricePerTerm, uint256 termSeconds)",
  "event Withdrawn(uint256 indexed canonicalId)",
  "event LeaseStarted(uint256 indexed canonicalId, address indexed tenant, uint256 activeUntil)",
  "event LeasedResolverSet(uint256 indexed canonicalId, address indexed tenant, address newResolver)",
  "event LeaseReclaimed(uint256 indexed canonicalId, address indexed parent)",
]);

export const OrderStatus = {
  None: 0,
  Active: 1,
  Suspended: 2,
  Filled: 3,
  Cancelled: 4,
} as const;
