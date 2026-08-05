// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IENSv2Registry} from "../v2/interfaces/IENSv2Registry.sol";
import {IENSv2Resolver} from "../v2/interfaces/IENSv2Resolver.sol";
import {IRegistryAdmin} from "./IRegistryAdmin.sol";

/// @notice Mock ENSv2-shaped registry for demoing the marketplace loop on Sepolia.
/// See IRegistryAdmin.sol for why the write surface here is an invented stand-in, not
/// confirmed ENSv2 behavior. The read surface (IENSv2Registry/IENSv2Resolver) is the part
/// plausibly reusable once real ENSv2 lands.
///
/// Canonical ID scheme is a mock stand-in (roadmap.md open item #3), not the real ENSv2
/// derivation: top-level names hash the name string; subnames hash (parentId, label).
contract MockENSv2Registry is IENSv2Registry, IENSv2Resolver, IRegistryAdmin {
    struct NameRecord {
        address owner;
        address resolver;
        uint96 version;
        bool exists;
    }

    /// @dev Role admins are self-managing (see setRole) — no owner-field escape hatch.
    /// This is what makes lease-term role custody (SubnameLeaseVault) actually enforced.
    bytes32 public constant SUBNAME_ADMIN_ROLE = keccak256("ENSv2Marketplace.SUBNAME_ADMIN_ROLE");

    mapping(uint256 => NameRecord) private _records;
    mapping(uint256 => mapping(bytes32 => mapping(address => bool))) private _roles;
    mapping(uint256 => address) public transferApproval;
    mapping(uint256 => uint256) public parentOf;
    mapping(uint256 => string) public nameOf;

    event Registered(uint256 indexed canonicalId, string name, address indexed owner);
    event SubnameRegistered(uint256 indexed parentId, uint256 indexed canonicalId, string label, address indexed owner);
    event ResolverChanged(uint256 indexed canonicalId, address indexed newResolver, uint96 newVersion);
    event OwnerChanged(uint256 indexed canonicalId, address indexed newOwner, uint96 newVersion);
    event RoleUpdated(uint256 indexed canonicalId, bytes32 indexed role, address indexed account, bool enabled);
    event TransferApproved(uint256 indexed canonicalId, address indexed operator);
    event Regenerated(uint256 indexed canonicalId, uint96 newVersion);

    error NameAlreadyExists();
    error NameDoesNotExist();
    error NotRoleHolder();
    error NotApprovedOperator();

    function ownerOf(uint256 canonicalId) external view returns (address) {
        return _records[canonicalId].owner;
    }

    function resolverOf(uint256 canonicalId) external view returns (address) {
        return _records[canonicalId].resolver;
    }

    function hasRole(uint256 canonicalId, bytes32 role, address account) public view returns (bool) {
        return _roles[canonicalId][role][account];
    }

    /// @notice Simplified for the PoC: no real forward-resolution, just the record owner.
    function addr(uint256 canonicalId) external view returns (address) {
        return _records[canonicalId].owner;
    }

    function register(string calldata name, address owner_) external returns (uint256 canonicalId) {
        canonicalId = uint256(keccak256(bytes(name)));
        if (_records[canonicalId].exists) revert NameAlreadyExists();

        _records[canonicalId] = NameRecord({owner: owner_, resolver: owner_, version: 1, exists: true});
        _roles[canonicalId][SUBNAME_ADMIN_ROLE][owner_] = true;
        nameOf[canonicalId] = name;

        emit Registered(canonicalId, name, owner_);
    }

    function registerSubname(uint256 parentId, string calldata label, address owner_)
        external
        returns (uint256 canonicalId)
    {
        if (!hasRole(parentId, SUBNAME_ADMIN_ROLE, msg.sender)) revert NotRoleHolder();

        canonicalId = uint256(keccak256(abi.encodePacked(parentId, label)));
        if (_records[canonicalId].exists) revert NameAlreadyExists();

        _records[canonicalId] = NameRecord({owner: owner_, resolver: owner_, version: 1, exists: true});
        _roles[canonicalId][SUBNAME_ADMIN_ROLE][owner_] = true;
        parentOf[canonicalId] = parentId;
        nameOf[canonicalId] = string.concat(label, ".", nameOf[parentId]);

        emit SubnameRegistered(parentId, canonicalId, label, owner_);
    }

    function setResolver(uint256 canonicalId, address newResolver) external {
        if (!_records[canonicalId].exists) revert NameDoesNotExist();
        if (!hasRole(canonicalId, SUBNAME_ADMIN_ROLE, msg.sender)) revert NotRoleHolder();

        NameRecord storage record = _records[canonicalId];
        record.resolver = newResolver;
        record.version += 1;

        emit ResolverChanged(canonicalId, newResolver, record.version);
        emit Regenerated(canonicalId, record.version);
    }

    function setRole(uint256 canonicalId, bytes32 role, address account, bool enabled) external {
        if (!_records[canonicalId].exists) revert NameDoesNotExist();
        if (!hasRole(canonicalId, role, msg.sender)) revert NotRoleHolder();

        _roles[canonicalId][role][account] = enabled;
        emit RoleUpdated(canonicalId, role, account, enabled);
    }

    function approveTransfer(uint256 canonicalId, address operator) external {
        if (!_records[canonicalId].exists) revert NameDoesNotExist();
        if (_records[canonicalId].owner != msg.sender) revert NotApprovedOperator();

        transferApproval[canonicalId] = operator;
        emit TransferApproved(canonicalId, operator);
    }

    function transferOwner(uint256 canonicalId, address newOwner) external {
        if (!_records[canonicalId].exists) revert NameDoesNotExist();
        if (transferApproval[canonicalId] != msg.sender) revert NotApprovedOperator();

        NameRecord storage record = _records[canonicalId];
        record.owner = newOwner;
        record.version += 1;
        transferApproval[canonicalId] = address(0);

        emit OwnerChanged(canonicalId, newOwner, record.version);
        emit Regenerated(canonicalId, record.version);
    }
}
