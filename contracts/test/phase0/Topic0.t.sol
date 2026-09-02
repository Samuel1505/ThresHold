// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { MinimalSubscriber } from "../../src/phase0/MinimalSubscriber.sol";

/// @notice PHASE 0.5 (local half) — the OrderFilled signature hash the subscriber filters on
///         must match keccak256 of the exact ABI string. The live half (compare to a real
///         emitted log's topic0) is scripts/05-topic0.ts and adversarial test A1.
contract Topic0Test is Test {
    function test_orderFilledTopic0_matchesSignature() public {
        MinimalSubscriber sub = new MinimalSubscriber();
        bytes32 expected = keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)");
        assertEq(
            sub.ORDER_FILLED_TOPIC0(), expected, "topic0 constant drifted from the ABI signature"
        );
    }

    function test_onEvent_rejectsNonPrecompileCaller() public {
        MinimalSubscriber sub = new MinimalSubscriber();
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = sub.ORDER_FILLED_TOPIC0();
        vm.expectRevert(); // SomniaEventHandler.OnlyReactivityPrecompile()
        sub.onEvent(address(0xBEEF), topics, "");
    }
}
