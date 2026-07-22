// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

/// @notice Skeleton — deploys RenewalRouter to Sepolia, wired to
/// UniversalRegistrarRenewalWithReferrer at 0x7AB2947592C280542e680Ba8f08A589009da8644.
contract DeployV1Sepolia is Script {
    function run() external {
        vm.startBroadcast();
        // TODO: deploy RenewalRouter once implemented.
        vm.stopBroadcast();
    }
}
