// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockENSv2Registry} from "../src/mock/MockENSv2Registry.sol";
import {CanonicalIdOrderManager} from "../src/v2/CanonicalIdOrderManager.sol";
import {SubnameLeaseVault} from "../src/v2/SubnameLeaseVault.sol";

/// @notice Sepolia counterpart to DeployLocal.s.sol — same mock registry + marketplace
/// contracts and the same demo data (alice.eth/bob.xyz/charlie.eth + subnames), so a
/// Vercel-hosted frontend has real, persistent, publicly-reachable contract state to read
/// instead of depending on a local Anvil process (which nothing on the internet can reach).
///
/// This is NOT the real ENSv2 Sepolia registry — that integration is still blocked on ENS
/// Labs confirming exact Registry/PermissionedRegistry/RegistryDatastore addresses (see
/// docs/roadmap.md's open items). This deploys our own MockENSv2Registry to Sepolia, the
/// same contract Anvil runs today, just on a real public testnet so the demo works without
/// anyone needing to run a chain themselves.
///
/// Every seed action (register/list/mutate/self-buy/announce/self-rent) runs under the
/// single DEPLOYER_PRIVATE_KEY, not per-actor keys like DeployLocal's Anvil well-known
/// test keys — committing separate throwaway private keys to a public repo isn't good
/// practice even for worthless testnet keys, and neither buy() nor rent() forbid the
/// caller from also being the seller/parent (verified in CanonicalIdOrderManager.buy and
/// SubnameLeaseVault.rent — no msg.sender != seller/parent check), so a single funded
/// address can safely play every role. The one cosmetic cost: every seed listing's
/// "Seller" column shows the same address, unlike the local Anvil demo's distinct
/// alice/bob/charlie addresses.
///
/// Run with:
///   cd contracts
///   forge script script/DeployV2Sepolia.s.sol --rpc-url sepolia --broadcast --verify
/// (reads SEPOLIA_RPC_URL/ETHERSCAN_API_KEY from contracts/.env — see .env.example; pass
/// --private-key $DEPLOYER_PRIVATE_KEY explicitly, or rely on `vm.startBroadcast()` below
/// picking up DEPLOYER_PRIVATE_KEY via forge's automatic env var detection.)
contract DeployV2Sepolia is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        MockENSv2Registry registry = new MockENSv2Registry();
        CanonicalIdOrderManager orderManager = new CanonicalIdOrderManager(address(registry));
        SubnameLeaseVault vault = new SubnameLeaseVault(address(registry));

        bytes32 subnameRole = vault.SUBNAME_ADMIN_ROLE();

        // alice.eth - listed for sale at 0.5 ETH.
        uint256 aliceId = registry.register("alice.eth", deployer);
        registry.approveTransfer(aliceId, address(orderManager));
        orderManager.list(aliceId, 0.5 ether);

        // bob.xyz - listed at 0.05 ETH, then mutated post-listing so it's already
        // Suspended-with-diff on first load (see DeployLocal.s.sol for why: a revert
        // inside buy() would undo the Suspended write too, so it's only ever persisted by
        // an actual fill attempt against mismatched state, never proactively). Priced far
        // below DeployLocal's 1 ETH: this is a real self-buy against a real funded Sepolia
        // key, not an Anvil test account with 10,000 ETH, so the deployer only needs to
        // hold this amount momentarily (it's refunded in full within the same call).
        uint256 bobId = registry.register("bob.xyz", deployer);
        registry.approveTransfer(bobId, address(orderManager));
        orderManager.list(bobId, 0.05 ether);
        registry.setResolver(bobId, address(0xB0B));
        orderManager.buy{value: 0.05 ether}(bobId); // refunded in full; flips status to Suspended

        // charlie.eth - unlisted, available for a live "list your domain" walkthrough.
        uint256 charlieId = registry.register("charlie.eth", deployer);

        // shop.alice.eth - subname, announced for rent at 0.1 ETH / 30 days.
        uint256 shopId = registry.registerSubname(aliceId, "shop", deployer);
        registry.setRole(shopId, subnameRole, address(vault), true);
        vault.announceForRent(shopId, 0.1 ether, 30 days);

        // blog.alice.eth - subname, announced then immediately leased (self-rented) with
        // a short 5-minute term so a live demo can show expiry + reclaim() without waiting.
        uint256 blogId = registry.registerSubname(aliceId, "blog", deployer);
        registry.setRole(blogId, subnameRole, address(vault), true);
        vault.announceForRent(blogId, 0.05 ether, 5 minutes);
        vault.rent{value: 0.05 ether}(blogId);

        vm.stopBroadcast();

        console2.log("MockENSv2Registry:      ", address(registry));
        console2.log("CanonicalIdOrderManager:", address(orderManager));
        console2.log("SubnameLeaseVault:      ", address(vault));
        console2.log("Deployer/seed address:  ", deployer);
        console2.log("---");
        console2.log("alice.eth canonicalId:  ", aliceId);
        console2.log("bob.xyz canonicalId:    ", bobId);
        console2.log("charlie.eth canonicalId:", charlieId);
        console2.log("shop.alice.eth id:      ", shopId);
        console2.log("blog.alice.eth id:      ", blogId);
    }
}
