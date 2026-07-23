import { keccak256, parseAbi, toBytes } from "viem";

/// Hardcoded local Anvil addresses from `contracts/script/DeployLocal.s.sol` — identical
/// on every redeploy since Anvil starts fresh and the deployer's nonce order never
/// changes. See docs/local-demo.md. Re-run the deploy script and update these if the
/// script's deploy order or constructor args ever change.
export const REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
export const ORDER_MANAGER_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as const;
export const LEASE_VAULT_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as const;

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
