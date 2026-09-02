// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Base } from "../Base.t.sol";
import { ThresholdHandler } from "../../src/ThresholdHandler.sol";
import {
    SomniaEventHandler
} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import { CreateParams, TriggerState } from "../../src/Types.sol";
import { MockBinaryPool } from "../mocks/MockBinaryPool.sol";

/// @dev A target that always reverts — for the isolation test.
contract RevertingTarget {
    function derisk() external pure {
        revert("nope");
    }
}

/// @dev A target that re-enters the registry during the action call.
contract ReenteringTarget {
    address internal reg;

    constructor(address _reg) {
        reg = _reg;
    }

    function derisk() external {
        // Try to mutate trigger state as the vault — must fail (onlyHandler).
        (bool ok,) = reg.call(
            abi.encodeWithSignature("applyEvaluation(uint256,uint8,uint64)", uint256(1), 1, 0)
        );
        require(!ok, "reentrancy should have been blocked");
    }
}

contract HandlerGuardsTest is Base {
    // ── A2 — onEvent from a non-precompile address reverts (I1) ──────────────
    function test_A2_onlyPrecompile() public {
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = registry.ORDER_FILLED_TOPIC0();
        vm.expectRevert(SomniaEventHandler.OnlyReactivityPrecompile.selector);
        handler.onEvent(address(pool), topics, "");
    }

    // ── A3 — a fake emitter with no triggers is a silent no-op ───────────────
    function test_A3_fakeEmitterNoOp() public {
        MockBinaryPool rogue = new MockBinaryPool();
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = registry.ORDER_FILLED_TOPIC0();
        vm.prank(PRECOMPILE);
        handler.onEvent(address(rogue), topics, ""); // must not revert, must do nothing
    }

    // ── A7 — nonce incremented mid-dwell (pool recycled) → EXPIRED, no exec ──
    function test_A7_nonceMismatchExpires() public {
        _setBook(pool, 5900, 6100, 300e6);
        uint256 id = _arm(alice, _defaultParams());
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));

        pool.setMarketNonce(999); // recycled onto a new market
        vm.warp(block.timestamp + 60);
        _fill();

        assertEq(uint8(_state(id)), uint8(TriggerState.EXPIRED));
        assertEq(_safe(), 0, "must not fire on a different market's book");
    }

    // ── A8 — a reverting target: that trigger FAILs, others still evaluate (I7) ─
    function test_A8_revertingTargetIsolated() public {
        RevertingTarget bad = new RevertingTarget();
        registry.setActionAllowed(address(bad), RevertingTarget.derisk.selector, true);

        _setBook(pool, 5900, 6100, 300e6);

        CreateParams memory pGood = _defaultParams();
        uint256 idGood = _arm(alice, pGood);

        CreateParams memory pBad = _defaultParams();
        pBad.target = address(bad);
        pBad.selector = RevertingTarget.derisk.selector;
        uint256 idBad = _arm(alice, pBad);

        _fill(); // both -> OBSERVING
        vm.warp(block.timestamp + 31);
        _fill(); // dwell elapsed for both

        assertEq(uint8(_state(idBad)), uint8(TriggerState.FAILED), "bad target -> FAILED");
        assertEq(uint8(_state(idGood)), uint8(TriggerState.EXECUTED), "good trigger unaffected");
        assertEq(_safe(), 10 ether);
    }

    // ── A14 — reentrancy from a malicious target cannot double-execute ───────
    function test_A14_reentrancyBlocked() public {
        ReenteringTarget evil = new ReenteringTarget(address(registry));
        registry.setActionAllowed(address(evil), ReenteringTarget.derisk.selector, true);

        _setBook(pool, 5900, 6100, 300e6);
        CreateParams memory p = _defaultParams();
        p.target = address(evil);
        p.selector = ReenteringTarget.derisk.selector;
        uint256 id = _arm(alice, p); // id == 1

        _fill();
        vm.warp(block.timestamp + 31);
        _fill(); // evil.derisk re-enters registry.applyEvaluation as the target -> blocked

        // trigger advanced exactly once; the reentrant call was rejected inside the target
        assertEq(uint8(_state(id)), uint8(TriggerState.EXECUTED));
    }

    // ── createTrigger is nonReentrant ───────────────────────────────────────
    function test_scheduledTickIsNoOpToday() public {
        // emitter == precompile hits the (PHASE 4) scheduled-tick branch — safe no-op now
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = bytes32(uint256(1));
        vm.prank(PRECOMPILE);
        handler.onEvent(PRECOMPILE, topics, "");
    }
}
