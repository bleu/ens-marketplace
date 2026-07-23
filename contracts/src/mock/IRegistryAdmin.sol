// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Write surface for the local mock ENSv2-shaped registry used to demo the
/// marketplace loop before real ENSv2 Sepolia addresses/roles/canonical-ID derivation are
/// confirmed (see docs/roadmap.md "Open items").
///
/// Deliberately kept separate from `IENSv2Registry` (the read surface, which is the part
/// plausibly reusable once real ENSv2 lands). Nothing here should be read as a claim about
/// real ENSv2's write ABI — it's an invented stand-in scoped to this local demo, and the
/// write-path integration should be expected to need real rework once ENSv2 specifics
/// land, not a trivial address swap.
interface IRegistryAdmin {
    /// @notice Registers a top-level name. Reverts if it already exists.
    function register(string calldata name, address owner_) external returns (uint256 canonicalId);

    /// @notice Registers a subname under `parentId`. Caller must hold the parent's
    /// SUBNAME_ADMIN_ROLE. Reverts if the subname already exists.
    function registerSubname(uint256 parentId, string calldata label, address owner_)
        external
        returns (uint256 canonicalId);

    /// @notice Changes a name's resolver — the regeneration trigger. Gated on the caller
    /// holding SUBNAME_ADMIN_ROLE for `canonicalId`, with no owner-field escape hatch.
    function setResolver(uint256 canonicalId, address newResolver) external;

    /// @notice Grants or revokes `role` for `account` on `canonicalId`. Gated on the
    /// caller already holding that same role — no owner-field escape hatch. This is what
    /// makes role custody (and therefore lease enforcement) real rather than assumed.
    function setRole(uint256 canonicalId, bytes32 role, address account, bool enabled) external;

    /// @notice ERC-721-style single-operator transfer approval, sale-side only —
    /// deliberately independent of SUBNAME_ADMIN_ROLE so a marketplace contract's blast
    /// radius is scoped to "can transfer ownership," never resolver/role control.
    function approveTransfer(uint256 canonicalId, address operator) external;

    /// @notice Transfers ownership. Caller must be the current approved operator.
    function transferOwner(uint256 canonicalId, address newOwner) external;

    /// @notice The address currently approved to transfer `canonicalId`, or address(0).
    function transferApproval(uint256 canonicalId) external view returns (address);
}
