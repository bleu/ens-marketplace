// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Pricing/eligibility policy for a subname lease.
/// @dev PoC scope implements only a fixed-price/fixed-term policy. Rule-based routing
/// (length, charset, allow-list -> price tiers/auction/reserved) is grant-scope, not PoC —
/// see docs/roadmap.md. This interface exists now so SubnameLeaseVault can be written
/// against a stable boundary regardless of which policy implementation lands first.
interface ILeasePolicy {
    /// @notice Returns the price (in wei) to lease `canonicalId` for `durationSeconds`.
    /// @dev Reverts if the policy does not allow leasing this name at all.
    function priceFor(uint256 canonicalId, uint256 durationSeconds) external view returns (uint256);
}
