// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockENSv2Registry} from "../../src/mock/MockENSv2Registry.sol";
import {CanonicalIdOrderManager} from "../../src/v2/CanonicalIdOrderManager.sol";
import {StateHash} from "../../src/v2/libraries/StateHash.sol";

/// @notice Covers the critique-driven behavior from docs/architecture.md: an order must
/// SUSPEND when the pinned state no longer matches live state at fill time, never
/// silently keep filling. This is what makes the order regeneration-AWARE rather than
/// regeneration-surviving.
///
/// Note: buy() does not revert on a state mismatch. A revert would undo the Suspended
/// status write along with it (Solidity rolls back every state change made in a reverting
/// call) - so buy() instead persists Suspended, refunds the buyer in full, and returns
/// normally. Tests assert on the persisted status and the refund, not on a revert.
contract RegenerationSuspendTest is Test {
    MockENSv2Registry registry;
    CanonicalIdOrderManager orderManager;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    uint256 aliceId;

    function setUp() public {
        registry = new MockENSv2Registry();
        orderManager = new CanonicalIdOrderManager(address(registry));

        vm.startPrank(alice);
        aliceId = registry.register("alice.eth", alice);
        registry.approveTransfer(aliceId, address(orderManager));
        orderManager.list(aliceId, 1 ether);
        vm.stopPrank();

        vm.deal(bob, 10 ether);
    }

    function test_buy_suspendsOnResolverChangeAfterListing() public {
        // Seller mutates the name's resolver after listing - simulating the exact v1
        // scam scenario ENSv2's token regeneration is meant to kill.
        vm.prank(alice);
        registry.setResolver(aliceId, carol);

        uint256 bobBalanceBefore = bob.balance;

        vm.prank(bob);
        orderManager.buy{value: 1 ether}(aliceId);

        (,,,,, CanonicalIdOrderManager.Status status) = orderManager.orders(aliceId);
        assertEq(uint8(status), uint8(CanonicalIdOrderManager.Status.Suspended));

        // Critically: ownership must NOT have transferred, and bob's payment must have
        // been refunded in full - the order never silently fills.
        assertEq(registry.ownerOf(aliceId), alice);
        assertEq(bob.balance, bobBalanceBefore);
    }

    function test_diff_showsMismatchAfterMutation() public {
        vm.prank(alice);
        registry.setResolver(aliceId, carol);

        vm.prank(bob);
        orderManager.buy{value: 1 ether}(aliceId);

        (address pinnedOwner, address pinnedResolver, address liveOwner, address liveResolver, bool mismatched) =
            orderManager.diff(aliceId);

        assertEq(pinnedOwner, alice);
        assertEq(pinnedResolver, alice);
        assertEq(liveOwner, alice);
        assertEq(liveResolver, carol);
        assertTrue(mismatched);
    }

    function test_acceptDiffAndRefill_happyPath() public {
        vm.prank(alice);
        registry.setResolver(aliceId, carol);

        vm.prank(bob);
        orderManager.buy{value: 1 ether}(aliceId);

        bytes32 liveHash = StateHash.hash(
            StateHash.PinnedState({owner: registry.ownerOf(aliceId), resolver: registry.resolverOf(aliceId)})
        );

        vm.prank(bob);
        orderManager.acceptDiffAndRefill{value: 1 ether}(aliceId, liveHash);

        assertEq(registry.ownerOf(aliceId), bob);
        (,,,,, CanonicalIdOrderManager.Status status) = orderManager.orders(aliceId);
        assertEq(uint8(status), uint8(CanonicalIdOrderManager.Status.Filled));
    }

    function test_acceptDiffAndRefill_revertsIfStateMovedAgainSinceDiff() public {
        vm.prank(alice);
        registry.setResolver(aliceId, carol);

        vm.prank(bob);
        orderManager.buy{value: 1 ether}(aliceId);

        // Bob computes the diff hash off-chain here...
        bytes32 staleHash = StateHash.hash(
            StateHash.PinnedState({owner: registry.ownerOf(aliceId), resolver: registry.resolverOf(aliceId)})
        );

        // ...but the state moves again before his transaction lands.
        vm.prank(alice);
        registry.setResolver(aliceId, address(0xdead));

        vm.prank(bob);
        vm.expectRevert(CanonicalIdOrderManager.StateMismatch.selector);
        orderManager.acceptDiffAndRefill{value: 1 ether}(aliceId, staleHash);
    }

    function test_acceptDiffAndRefill_revertsIfSellerNoLongerOwns() public {
        vm.prank(alice);
        registry.setResolver(aliceId, carol);

        vm.prank(bob);
        orderManager.buy{value: 1 ether}(aliceId);

        // Alice transfers the name away entirely through some other path.
        vm.prank(alice);
        registry.approveTransfer(aliceId, alice);
        vm.prank(alice);
        registry.transferOwner(aliceId, carol);

        bytes32 liveHash = StateHash.hash(
            StateHash.PinnedState({owner: registry.ownerOf(aliceId), resolver: registry.resolverOf(aliceId)})
        );

        vm.prank(bob);
        vm.expectRevert(CanonicalIdOrderManager.SellerChanged.selector);
        orderManager.acceptDiffAndRefill{value: 1 ether}(aliceId, liveHash);
    }
}
