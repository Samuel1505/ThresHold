// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { ThresholdRegistry } from "../src/ThresholdRegistry.sol";
import { ThresholdHandler } from "../src/ThresholdHandler.sol";
import { DemoVault } from "../src/DemoVault.sol";

/// @notice PHASE 5 — deploy Threshold to Somnia Shannon (docs/13).
/// @dev
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $SOMNIA_SHANNON_RPC --private-key $DEPLOYER_PRIVATE_KEY --broadcast -vvv
///
/// Env:
///   REGISTRY_FUNDING   native wei to send the registry (default 33e18; must clear the 32 STT
///                      SUBSCRIPTION_OWNER_MINIMUM_BALANCE plus callback-gas headroom)
///   VAULT_DEPOSIT      native wei to seed DemoVault.riskyBalance (default 0.1e18)
contract Deploy is Script {
    function run()
        external
        returns (ThresholdRegistry registry, ThresholdHandler handler, DemoVault vault)
    {
        uint256 funding = vm.envOr("REGISTRY_FUNDING", uint256(33 ether));
        uint256 vaultDeposit = vm.envOr("VAULT_DEPOSIT", uint256(0.1 ether));

        vm.startBroadcast();

        // 1. Registry (admin = broadcaster)
        registry = new ThresholdRegistry();

        // 2. Handler (needs the registry)
        handler = new ThresholdHandler(registry);

        // 3. DemoVault (handler is immutable — deploy after the handler)
        vault = new DemoVault(address(handler));

        // 4. Wire the handler
        registry.setHandler(address(handler));

        // 5. Allow-list DemoVault.derisk()
        registry.setActionAllowed(address(vault), DemoVault.derisk.selector, true);

        // 6. Fund the registry past the subscription minimum (BLOCKER-1 gate)
        (bool ok,) = address(registry).call{ value: funding }("");
        require(ok, "registry funding failed");

        // 7. Seed the vault's risky balance for the demo
        if (vaultDeposit != 0) vault.deposit{ value: vaultDeposit }();

        vm.stopBroadcast();

        require(address(registry).balance >= 32 ether, "registry below 32 STT");

        console2.log("ThresholdRegistry:", address(registry));
        console2.log("ThresholdHandler: ", address(handler));
        console2.log("DemoVault:        ", address(vault));
        console2.log("registry balance: ", address(registry).balance);
        console2.log("vault riskyBalance:", vault.riskyBalance());
        console2.log("derisk() selector:");
        console2.logBytes4(DemoVault.derisk.selector);
    }
}
