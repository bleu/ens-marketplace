// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockENSv2Registry} from "../../src/mock/MockENSv2Registry.sol";

contract MockENSv2RegistryTest is Test {
    MockENSv2Registry registry;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        registry = new MockENSv2Registry();
    }

    function test_register_setsOwnerAndRole() public {
        vm.prank(alice);
        uint256 id = registry.register("alice.eth", alice);

        assertEq(registry.ownerOf(id), alice);
        assertEq(registry.resolverOf(id), alice);
        assertTrue(registry.hasRole(id, registry.SUBNAME_ADMIN_ROLE(), alice));
    }

    function test_register_revertsOnDuplicate() public {
        vm.prank(alice);
        registry.register("alice.eth", alice);

        vm.prank(bob);
        vm.expectRevert(MockENSv2Registry.NameAlreadyExists.selector);
        registry.register("alice.eth", bob);
    }

    function test_registerSubname_requiresParentRole() public {
        vm.prank(alice);
        uint256 parentId = registry.register("alice.eth", alice);

        vm.prank(bob);
        vm.expectRevert(MockENSv2Registry.NotRoleHolder.selector);
        registry.registerSubname(parentId, "shop", bob);

        vm.prank(alice);
        uint256 subId = registry.registerSubname(parentId, "shop", alice);
        assertEq(registry.ownerOf(subId), alice);
        assertEq(registry.parentOf(subId), parentId);
        assertEq(registry.nameOf(subId), "shop.alice.eth");
    }

    function test_setResolver_gatedOnRole_andRegenerates() public {
        vm.prank(alice);
        uint256 id = registry.register("alice.eth", alice);

        vm.prank(bob);
        vm.expectRevert(MockENSv2Registry.NotRoleHolder.selector);
        registry.setResolver(id, bob);

        vm.prank(alice);
        registry.setResolver(id, carol);
        assertEq(registry.resolverOf(id), carol);
    }

    function test_setRole_selfManaging_noOwnerEscapeHatch() public {
        vm.prank(alice);
        uint256 id = registry.register("alice.eth", alice);

        bytes32 role = registry.SUBNAME_ADMIN_ROLE();

        // bob doesn't hold the role, so bob can't grant it to himself either.
        vm.prank(bob);
        vm.expectRevert(MockENSv2Registry.NotRoleHolder.selector);
        registry.setRole(id, role, bob, true);

        // alice (role holder) can grant it to a vault-like address...
        vm.prank(alice);
        registry.setRole(id, role, bob, true);
        assertTrue(registry.hasRole(id, role, bob));

        // ...and once alice's own role is revoked (e.g. by bob, now a co-holder), alice
        // can no longer call setResolver directly - this is the core lease invariant.
        vm.prank(bob);
        registry.setRole(id, role, alice, false);
        assertFalse(registry.hasRole(id, role, alice));

        vm.prank(alice);
        vm.expectRevert(MockENSv2Registry.NotRoleHolder.selector);
        registry.setResolver(id, carol);
    }

    function test_transfer_requiresApproval() public {
        vm.prank(alice);
        uint256 id = registry.register("alice.eth", alice);

        vm.prank(bob);
        vm.expectRevert(MockENSv2Registry.NotApprovedOperator.selector);
        registry.transferOwner(id, bob);

        vm.prank(alice);
        registry.approveTransfer(id, bob);

        vm.prank(bob);
        registry.transferOwner(id, bob);
        assertEq(registry.ownerOf(id), bob);
    }

    function test_addr_returnsOwner() public {
        vm.prank(alice);
        uint256 id = registry.register("alice.eth", alice);
        assertEq(registry.addr(id), alice);
    }
}
