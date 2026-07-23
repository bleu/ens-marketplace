// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockENSv2Registry} from "../../src/mock/MockENSv2Registry.sol";
import {CanonicalIdOrderManager} from "../../src/v2/CanonicalIdOrderManager.sol";

contract CanonicalIdOrderManagerTest is Test {
    MockENSv2Registry registry;
    CanonicalIdOrderManager orderManager;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 aliceId;

    function setUp() public {
        registry = new MockENSv2Registry();
        orderManager = new CanonicalIdOrderManager(address(registry));

        vm.prank(alice);
        aliceId = registry.register("alice.eth", alice);

        vm.deal(bob, 10 ether);
    }

    function _listAlice(uint256 price) private {
        vm.startPrank(alice);
        registry.approveTransfer(aliceId, address(orderManager));
        orderManager.list(aliceId, price);
        vm.stopPrank();
    }

    function test_list_revertsWithoutApproval() public {
        vm.prank(alice);
        vm.expectRevert(CanonicalIdOrderManager.NotAuthorizedToTransfer.selector);
        orderManager.list(aliceId, 1 ether);
    }

    function test_list_revertsIfNotOwner() public {
        vm.prank(bob);
        vm.expectRevert(CanonicalIdOrderManager.NotSeller.selector);
        orderManager.list(aliceId, 1 ether);
    }

    function test_list_pinsStateAndActivates() public {
        _listAlice(1 ether);

        (address seller, uint256 price,,,, CanonicalIdOrderManager.Status status) = orderManager.orders(aliceId);
        assertEq(seller, alice);
        assertEq(price, 1 ether);
        assertEq(uint8(status), uint8(CanonicalIdOrderManager.Status.Active));
    }

    function test_buy_happyPath_transfersAndPaysSellerAndRefundsExcess() public {
        _listAlice(1 ether);

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(bob);
        orderManager.buy{value: 1.5 ether}(aliceId);

        assertEq(registry.ownerOf(aliceId), bob);
        assertEq(alice.balance, aliceBalanceBefore + 1 ether);
        assertEq(bob.balance, 10 ether - 1 ether);
    }

    function test_buy_revertsOnInsufficientPayment() public {
        _listAlice(1 ether);

        vm.prank(bob);
        vm.expectRevert(CanonicalIdOrderManager.InsufficientPayment.selector);
        orderManager.buy{value: 0.5 ether}(aliceId);
    }

    function test_buy_revertsIfNotActive() public {
        vm.prank(bob);
        vm.expectRevert(CanonicalIdOrderManager.OrderNotActive.selector);
        orderManager.buy{value: 1 ether}(aliceId);
    }

    function test_relist_reprintsStateAndPrice() public {
        _listAlice(1 ether);

        vm.prank(alice);
        orderManager.cancel(aliceId);

        vm.prank(alice);
        orderManager.relist(aliceId, 2 ether);

        (, uint256 price,,,, CanonicalIdOrderManager.Status status) = orderManager.orders(aliceId);
        assertEq(price, 2 ether);
        assertEq(uint8(status), uint8(CanonicalIdOrderManager.Status.Active));
    }

    function test_cancel_onlySeller() public {
        _listAlice(1 ether);

        vm.prank(bob);
        vm.expectRevert(CanonicalIdOrderManager.NotSeller.selector);
        orderManager.cancel(aliceId);

        vm.prank(alice);
        orderManager.cancel(aliceId);

        (,,,,, CanonicalIdOrderManager.Status status) = orderManager.orders(aliceId);
        assertEq(uint8(status), uint8(CanonicalIdOrderManager.Status.Cancelled));
    }
}
