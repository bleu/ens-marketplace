// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal read surface this repo needs from an ENSv2 registry.
/// @dev Placeholder interface — the real ENSv2 registry ABI (role names, canonical-ID
/// derivation, and the event emitted on token/role regeneration) is not yet finalized in
/// this repo. See docs/roadmap.md "Open items" before implementing against this.
interface IENSv2Registry {
    /// @notice Returns the current owner of a name identified by its canonical ID.
    function ownerOf(uint256 canonicalId) external view returns (address);

    /// @notice Returns the current resolver address for a name identified by its canonical ID.
    function resolverOf(uint256 canonicalId) external view returns (address);

    /// @notice Returns whether `account` holds `role` on the name identified by its canonical ID.
    function hasRole(uint256 canonicalId, bytes32 role, address account) external view returns (bool);
}
