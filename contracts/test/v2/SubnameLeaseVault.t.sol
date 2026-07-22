// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

/// @notice Placeholder — SubnameLeaseVault itself is not implemented yet. The core
/// invariant to test once it exists: a parent cannot revoke/reassign a subname while a
/// lease is active, because the vault holds the relevant registry roles for the lease
/// term. See docs/architecture.md and docs/roadmap.md.
contract SubnameLeaseVaultTest is Test {
    function test_placeholder_no_revoke_while_lease_active() public pure {
        assertTrue(true);
    }
}
