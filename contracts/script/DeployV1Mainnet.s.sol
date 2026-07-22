// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";

/// @notice Skeleton — deploys RenewalRouter to mainnet, wired to
/// UniversalRegistrarRenewalWithReferrer at 0xf55575Bde5953ee4272d5CE7cdD924c74d8fA81A.
/// Do not run until Slice 2 is demo-ready and the swap adapter provider is chosen.
contract DeployV1Mainnet is Script {
    function run() external {
        vm.startBroadcast();
        // TODO: deploy RenewalRouter once implemented.
        vm.stopBroadcast();
    }
}
