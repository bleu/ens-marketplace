// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IENSv2Registry} from "./interfaces/IENSv2Registry.sol";
import {IRegistryAdmin} from "../mock/IRegistryAdmin.sol";

/// @notice Subname rental with the lease-term the parent's registry roles are delegated
/// to this vault for — see docs/architecture.md. A parent cannot revoke/reassign a
/// subname mid-lease not because of a special-cased check here, but because the registry
/// gates role-changing calls strictly on role-holding: once the vault holds
/// SUBNAME_ADMIN_ROLE and the parent's own copy has been stripped for the lease term, the
/// parent literally cannot call setResolver/setRole on that name directly. This is an
/// emergent property of role custody, not a promise this contract enforces by fiat.
///
/// "Auto-return on expiry" means reclaim() is permissionless and lazy: nothing reverts
/// automatically on-chain without a transaction. Anyone (a keeper, the parent, the next
/// renter's own flow) can call it once a lease has expired.
///
/// Runs against `IRegistryAdmin` (mock stand-in write ABI, not confirmed ENSv2 behavior).
contract SubnameLeaseVault is ReentrancyGuard {
    bytes32 public constant SUBNAME_ADMIN_ROLE = keccak256("ENSv2Marketplace.SUBNAME_ADMIN_ROLE");

    struct Listing {
        address parent;
        uint256 pricePerTerm;
        uint256 termSeconds;
        bool active;
    }

    address public immutable registry;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public leaseActiveUntil;
    mapping(uint256 => address) public tenantOf;
    mapping(uint256 => address) public parentOf;

    event Announced(uint256 indexed canonicalId, address indexed parent, uint256 pricePerTerm, uint256 termSeconds);
    event Withdrawn(uint256 indexed canonicalId);
    event LeaseStarted(uint256 indexed canonicalId, address indexed tenant, uint256 activeUntil);
    event LeasedResolverSet(uint256 indexed canonicalId, address indexed tenant, address newResolver);
    event LeaseReclaimed(uint256 indexed canonicalId, address indexed parent);

    error NotRoleHolder();
    error VaultNotPreauthorized();
    error NotListed();
    error CurrentlyLeased();
    error NotParent();
    error ParentRoleStale();
    error InsufficientPayment();
    error NotTenant();
    error LeaseNotActive();
    error LeaseNotExpired();
    error NoLeaseToReclaim();
    error PaymentFailed();

    constructor(address registry_) {
        registry = registry_;
    }

    function _isLeased(uint256 canonicalId) private view returns (bool) {
        return block.timestamp < leaseActiveUntil[canonicalId];
    }

    function announceForRent(uint256 canonicalId, uint256 pricePerTerm, uint256 termSeconds) external {
        if (!IENSv2Registry(registry).hasRole(canonicalId, SUBNAME_ADMIN_ROLE, msg.sender)) revert NotRoleHolder();
        if (!IENSv2Registry(registry).hasRole(canonicalId, SUBNAME_ADMIN_ROLE, address(this))) {
            revert VaultNotPreauthorized();
        }

        listings[canonicalId] =
            Listing({parent: msg.sender, pricePerTerm: pricePerTerm, termSeconds: termSeconds, active: true});

        emit Announced(canonicalId, msg.sender, pricePerTerm, termSeconds);
    }

    function withdraw(uint256 canonicalId) external {
        Listing storage listing = listings[canonicalId];
        if (listing.parent != msg.sender) revert NotParent();
        if (_isLeased(canonicalId)) revert CurrentlyLeased();

        listing.active = false;
        emit Withdrawn(canonicalId);
    }

    function rent(uint256 canonicalId) external payable nonReentrant {
        Listing storage listing = listings[canonicalId];
        if (!listing.active) revert NotListed();
        if (_isLeased(canonicalId)) revert CurrentlyLeased();
        if (!IENSv2Registry(registry).hasRole(canonicalId, SUBNAME_ADMIN_ROLE, listing.parent)) {
            revert ParentRoleStale();
        }
        if (msg.value < listing.pricePerTerm) revert InsufficientPayment();

        leaseActiveUntil[canonicalId] = block.timestamp + listing.termSeconds;
        tenantOf[canonicalId] = msg.sender;
        parentOf[canonicalId] = listing.parent;

        IRegistryAdmin(registry).setRole(canonicalId, SUBNAME_ADMIN_ROLE, listing.parent, false);

        (bool paid,) = payable(listing.parent).call{value: listing.pricePerTerm}("");
        if (!paid) revert PaymentFailed();

        uint256 excess = msg.value - listing.pricePerTerm;
        if (excess > 0) {
            (bool refunded,) = payable(msg.sender).call{value: excess}("");
            if (!refunded) revert PaymentFailed();
        }

        emit LeaseStarted(canonicalId, msg.sender, leaseActiveUntil[canonicalId]);
    }

    function setLeasedResolver(uint256 canonicalId, address newResolver) external {
        if (tenantOf[canonicalId] != msg.sender) revert NotTenant();
        if (!_isLeased(canonicalId)) revert LeaseNotActive();

        IRegistryAdmin(registry).setResolver(canonicalId, newResolver);
        emit LeasedResolverSet(canonicalId, msg.sender, newResolver);
    }

    /// @notice Permissionless - anyone can trigger the return of an expired lease's role
    /// to the parent (keeper-bot-friendly). See contract-level note: this is lazy, not
    /// automatic in the sense of requiring no transaction at all.
    function reclaim(uint256 canonicalId) external {
        uint256 activeUntil = leaseActiveUntil[canonicalId];
        if (activeUntil == 0) revert NoLeaseToReclaim();
        if (block.timestamp < activeUntil) revert LeaseNotExpired();

        address parent = parentOf[canonicalId];
        IRegistryAdmin(registry).setRole(canonicalId, SUBNAME_ADMIN_ROLE, parent, true);

        leaseActiveUntil[canonicalId] = 0;
        tenantOf[canonicalId] = address(0);

        emit LeaseReclaimed(canonicalId, parent);
    }
}
