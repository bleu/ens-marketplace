// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockENSv2Registry} from "../../src/mock/MockENSv2Registry.sol";
import {SubnameLeaseVault} from "../../src/v2/SubnameLeaseVault.sol";

/// @notice Covers the critique-driven invariant from docs/architecture.md: a parent
/// cannot revoke/reassign a subname mid-lease, because the vault - not the parent - holds
/// the registry role for the lease term.
contract SubnameLeaseVaultTest is Test {
    MockENSv2Registry registry;
    SubnameLeaseVault vault;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    uint256 aliceId;
    uint256 shopId;

    uint256 constant PRICE = 0.1 ether;
    uint256 constant TERM = 30 days;

    function setUp() public {
        registry = new MockENSv2Registry();
        vault = new SubnameLeaseVault(address(registry));

        vm.startPrank(alice);
        aliceId = registry.register("alice.eth", alice);
        shopId = registry.registerSubname(aliceId, "shop", alice);
        registry.setRole(shopId, vault.SUBNAME_ADMIN_ROLE(), address(vault), true);
        vault.announceForRent(shopId, PRICE, TERM);
        vm.stopPrank();

        vm.deal(bob, 10 ether);
    }

    function test_announceForRent_revertsIfVaultNotPreauthorized() public {
        vm.prank(alice);
        uint256 blogId = registry.registerSubname(aliceId, "blog", alice);

        vm.prank(alice);
        vm.expectRevert(SubnameLeaseVault.VaultNotPreauthorized.selector);
        vault.announceForRent(blogId, PRICE, TERM);
    }

    function test_rent_happyPath_paysParentAndStripsParentRole() public {
        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(bob);
        vault.rent{value: PRICE}(shopId);

        assertEq(tenantOfLease(), bob);
        assertEq(alice.balance, aliceBalanceBefore + PRICE);
        assertFalse(registry.hasRole(shopId, vault.SUBNAME_ADMIN_ROLE(), alice));
        assertTrue(registry.hasRole(shopId, vault.SUBNAME_ADMIN_ROLE(), address(vault)));
    }

    function tenantOfLease() private view returns (address) {
        return vault.tenantOf(shopId);
    }

    function test_rent_refundsExcess() public {
        vm.prank(bob);
        vault.rent{value: PRICE + 0.05 ether}(shopId);

        assertEq(bob.balance, 10 ether - PRICE);
    }

    function test_rent_revertsIfAlreadyLeased() public {
        vm.prank(bob);
        vault.rent{value: PRICE}(shopId);

        vm.prank(carol);
        vm.deal(carol, 1 ether);
        vm.expectRevert(SubnameLeaseVault.CurrentlyLeased.selector);
        vault.rent{value: PRICE}(shopId);
    }

    function test_parentCannotTouchSubnameDirectly_midLease() public {
        vm.prank(bob);
        vault.rent{value: PRICE}(shopId);

        // The core invariant: alice (parent) no longer holds the role, so she cannot
        // call setResolver/setRole on the leased subname directly - the registry itself
        // refuses her, not a special-cased check in the vault.
        vm.prank(alice);
        vm.expectRevert(MockENSv2Registry.NotRoleHolder.selector);
        registry.setResolver(shopId, carol);

        // Hoisted out of the call below: vault.SUBNAME_ADMIN_ROLE() as an inline argument
        // would create its own call frame first, consuming expectRevert's "next call"
        // before setRole itself ever executes.
        bytes32 role = vault.SUBNAME_ADMIN_ROLE();
        vm.prank(alice);
        vm.expectRevert(MockENSv2Registry.NotRoleHolder.selector);
        registry.setRole(shopId, role, alice, true);
    }

    function test_setLeasedResolver_onlyTenantDuringTerm() public {
        vm.prank(bob);
        vault.rent{value: PRICE}(shopId);

        // Not the tenant.
        vm.prank(carol);
        vm.expectRevert(SubnameLeaseVault.NotTenant.selector);
        vault.setLeasedResolver(shopId, carol);

        // Tenant, during the term - succeeds, executed by the vault which holds the role.
        vm.prank(bob);
        vault.setLeasedResolver(shopId, bob);
        assertEq(registry.resolverOf(shopId), bob);

        // After expiry, even the tenant can no longer set it.
        vm.warp(block.timestamp + TERM + 1);
        vm.prank(bob);
        vm.expectRevert(SubnameLeaseVault.LeaseNotActive.selector);
        vault.setLeasedResolver(shopId, carol);
    }

    function test_reclaim_permissionless_restoresParentRoleAfterExpiry() public {
        vm.prank(bob);
        vault.rent{value: PRICE}(shopId);

        vm.warp(block.timestamp + TERM + 1);

        // Permissionless - carol (an unrelated keeper) can trigger it.
        vm.prank(carol);
        vault.reclaim(shopId);

        assertTrue(registry.hasRole(shopId, vault.SUBNAME_ADMIN_ROLE(), alice));
        assertEq(vault.tenantOf(shopId), address(0));
        assertEq(vault.leaseActiveUntil(shopId), 0);

        // Alice regains direct control.
        vm.prank(alice);
        registry.setResolver(shopId, carol);
        assertEq(registry.resolverOf(shopId), carol);
    }

    function test_reclaim_revertsBeforeExpiry() public {
        vm.prank(bob);
        vault.rent{value: PRICE}(shopId);

        vm.expectRevert(SubnameLeaseVault.LeaseNotExpired.selector);
        vault.reclaim(shopId);
    }

    function test_rent_revertsIfParentRoleWentStaleWithoutReclaim() public {
        vm.prank(bob);
        vault.rent{value: PRICE}(shopId);

        vm.warp(block.timestamp + TERM + 1);

        // Second rent attempt without reclaim() first: the listing's recorded parent
        // still doesn't hold the role (nobody restored it yet), so rent() must refuse -
        // this is the staleness guard, not a missing feature.
        vm.deal(carol, 1 ether);
        vm.prank(carol);
        vm.expectRevert(SubnameLeaseVault.ParentRoleStale.selector);
        vault.rent{value: PRICE}(shopId);
    }

    function test_withdraw_onlyWhenNotLeased() public {
        vm.prank(bob);
        vault.rent{value: PRICE}(shopId);

        vm.prank(alice);
        vm.expectRevert(SubnameLeaseVault.CurrentlyLeased.selector);
        vault.withdraw(shopId);

        vm.warp(block.timestamp + TERM + 1);
        vault.reclaim(shopId);

        vm.prank(alice);
        vault.withdraw(shopId);

        (,,, bool active) = vault.listings(shopId);
        assertFalse(active);
    }
}
