// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockENSv2Registry} from "../src/mock/MockENSv2Registry.sol";
import {CanonicalIdOrderManager} from "../src/v2/CanonicalIdOrderManager.sol";
import {SubnameLeaseVault} from "../src/v2/SubnameLeaseVault.sol";

/// @notice Deploys the mock registry + both marketplace contracts to a local Anvil chain
/// and seeds demo data, so there's real data to click through immediately after deploy.
/// See docs/local-dev.md for the run recipe.
///
/// LOCAL-ONLY: the private keys below are Anvil's well-known default test keys (derived
/// from the standard "test test test test test test test test test test test junk"
/// mnemonic), the same ones Anvil prints on every startup. Never point this script at a
/// real network.
contract DeployLocal is Script {
    uint256 constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant ALICE_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 constant BOB_KEY = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 constant CHARLIE_KEY = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    uint256 constant DAVE_KEY = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;

    function run() external {
        address alice = vm.addr(ALICE_KEY);
        address bob = vm.addr(BOB_KEY);
        address charlie = vm.addr(CHARLIE_KEY);

        vm.startBroadcast(DEPLOYER_KEY);
        MockENSv2Registry registry = new MockENSv2Registry();
        CanonicalIdOrderManager orderManager = new CanonicalIdOrderManager(address(registry));
        SubnameLeaseVault vault = new SubnameLeaseVault(address(registry));
        vm.stopBroadcast();

        bytes32 subnameRole = vault.SUBNAME_ADMIN_ROLE();

        // alice.eth - listed for sale at 0.5 ETH.
        vm.startBroadcast(ALICE_KEY);
        uint256 aliceId = registry.register("alice.eth", alice);
        registry.approveTransfer(aliceId, address(orderManager));
        orderManager.list(aliceId, 0.5 ether);
        vm.stopBroadcast();

        // bob.xyz - listed at 1.0 ETH, then mutated post-listing. The order's on-chain
        // `status` only flips Active -> Suspended reactively, inside a buy() attempt
        // (see CanonicalIdOrderManager.buy: a revert would undo that write, so it's only
        // ever persisted by an actual fill attempt, never proactively). We trigger that
        // flip here with a throwaway buy attempt (fully refunded) so the order is already
        // Suspended-with-diff on first load - no manual steps needed to see the behavior.
        vm.startBroadcast(BOB_KEY);
        uint256 bobId = registry.register("bob.xyz", bob);
        registry.approveTransfer(bobId, address(orderManager));
        orderManager.list(bobId, 1 ether);
        registry.setResolver(bobId, charlie);
        vm.stopBroadcast();

        vm.startBroadcast(DAVE_KEY);
        orderManager.buy{value: 1 ether}(bobId); // refunded in full; flips status to Suspended
        vm.stopBroadcast();

        // charlie.eth - unlisted, available for a live "list your domain" walkthrough.
        vm.startBroadcast(CHARLIE_KEY);
        uint256 charlieId = registry.register("charlie.eth", charlie);
        vm.stopBroadcast();

        uint256 shopId;
        uint256 blogId;

        vm.startBroadcast(ALICE_KEY);
        // shop.alice.eth - subname, announced for rent at 0.1 ETH / 30 days.
        shopId = registry.registerSubname(aliceId, "shop", alice);
        registry.setRole(shopId, subnameRole, address(vault), true);
        vault.announceForRent(shopId, 0.1 ether, 30 days);

        // blog.alice.eth - subname, announced then immediately leased to dave with a
        // short 5-minute term so a live demo can show expiry + reclaim() without waiting.
        blogId = registry.registerSubname(aliceId, "blog", alice);
        registry.setRole(blogId, subnameRole, address(vault), true);
        vault.announceForRent(blogId, 0.05 ether, 5 minutes);
        vm.stopBroadcast();

        vm.startBroadcast(DAVE_KEY);
        vault.rent{value: 0.05 ether}(blogId);
        vm.stopBroadcast();

        console2.log("MockENSv2Registry:      ", address(registry));
        console2.log("CanonicalIdOrderManager:", address(orderManager));
        console2.log("SubnameLeaseVault:      ", address(vault));
        console2.log("---");
        console2.log("alice.eth canonicalId:  ", aliceId);
        console2.log("bob.xyz canonicalId:    ", bobId);
        console2.log("charlie.eth canonicalId:", charlieId);
        console2.log("shop.alice.eth id:      ", shopId);
        console2.log("blog.alice.eth id:      ", blogId);
    }
}
