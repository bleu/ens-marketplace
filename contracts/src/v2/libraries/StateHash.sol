// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Computes the pinned-state hash an order is validated against at fill time.
/// @dev This is the regeneration-AWARE check at the core of the v2 order design: an order
/// pins a hash of the buyer-relevant state (owner, resolver, and the specific ENSv2 roles
/// that matter for a "clean" listing) at listing time. On fill, the current state is
/// re-hashed and compared — a mismatch means the name mutated since listing (e.g. a
/// role/resolver change triggered ENSv2's token regeneration) and the order must suspend
/// rather than silently continue to be fillable. See docs/architecture.md.
///
/// STUB: the exact field set (which roles matter, in what order) depends on ENSv2's final
/// role model and is not finalized here — see docs/roadmap.md "Open items" before this
/// is wired into CanonicalIdOrderManager.
library StateHash {
    struct PinnedState {
        address owner;
        address resolver;
        // Additional role/permission fields land here once ENSv2's role model is confirmed.
    }

    function hash(PinnedState memory state) internal pure returns (bytes32) {
        return keccak256(abi.encode(state.owner, state.resolver));
    }
}
