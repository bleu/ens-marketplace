// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal read surface this repo needs from an ENSv2 resolver.
/// @dev Placeholder interface — see docs/roadmap.md "Open items" before implementing against this.
interface IENSv2Resolver {
    /// @notice Returns the address record a resolver currently points a name at.
    function addr(uint256 canonicalId) external view returns (address);
}
