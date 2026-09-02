// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { MinimalSubscriber } from "../../src/phase0/MinimalSubscriber.sol";

/// @notice PHASE 0 — deploy the throwaway subscriber (docs/16 §0.2).
/// @dev Usage:
///   forge script script/phase0/DeployMinimalSubscriber.s.sol \
///     --rpc-url shannon --private-key $DEPLOYER_PRIVATE_KEY --broadcast
///
/// Then, still in PHASE 0:
///   1. cast send <sub> --value 32ether           (fund past SUBSCRIPTION_OWNER_MINIMUM_BALANCE)
///   2. cast balance <sub>                          (confirm >= 32 STT — task 0.2 gate)
///   3. cast send <sub> "subscribeToPool(address,bytes32)" <pool> <topic0>   (task 0.6)
///   4. run scripts/06-crossing-order.ts, then read `callbacksLength()` / `callbacks(0)`
contract DeployMinimalSubscriber is Script {
    function run() external returns (MinimalSubscriber sub) {
        vm.startBroadcast();
        sub = new MinimalSubscriber();
        vm.stopBroadcast();

        console2.log("MinimalSubscriber:", address(sub));
        console2.log("owner:", sub.owner());
        console2.log("ORDER_FILLED_TOPIC0:");
        console2.logBytes32(sub.ORDER_FILLED_TOPIC0());
        console2.log("Next: fund with >= 32 STT, then subscribeToPool(pool, topic0).");
    }
}
