// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

/// @notice Skeleton — deploys CanonicalIdOrderManager + SubnameLeaseVault to Sepolia once
/// they exist and the ENSv2 Sepolia registry addresses are confirmed (docs/roadmap.md).
contract DeployV2Sepolia is Script {
    function run() external {
        vm.startBroadcast();
        // TODO: deploy CanonicalIdOrderManager and SubnameLeaseVault once implemented.
        vm.stopBroadcast();
    }
}
