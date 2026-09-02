// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Vm } from "forge-std/Vm.sol";
import {
    ISomniaReactivityPrecompile
} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";
import { Base } from "../Base.t.sol";
import { ThresholdRegistry } from "../../src/ThresholdRegistry.sol";
import { ThresholdHandler } from "../../src/ThresholdHandler.sol";
import { DemoVault } from "../../src/DemoVault.sol";
import { CreateParams, Direction, TriggerState } from "../../src/Types.sol";
import { MockBinaryPool } from "../mocks/MockBinaryPool.sol";

/// @notice docs/12 A1, A6, I3, I5 + scheduled dwell-expiry — PHASE 4 acceptance.
contract ReactivityTest is Base {
    string constant SIG = "OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)";

    // ── A1 — topic0 verification against a real emitted log ─────────────────
    function test_A1_orderFilledTopic0() public {
        assertEq(registry.ORDER_FILLED_TOPIC0(), keccak256(bytes(SIG)), "constant != keccak(sig)");

        vm.recordLogs();
        pool.emitOrderFilled(4321);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], registry.ORDER_FILLED_TOPIC0(), "real log topic0 mismatch");
        assertEq(logs[0].topics.length, 3, "sig + 2 indexed uint128");
        // fillPrice is non-indexed -> last 32 bytes of data
        assertEq(logs[0].data.length, 128, "4 x uint256 non-indexed");
        (,,, uint256 fillPrice) = abi.decode(logs[0].data, (uint256, uint256, uint256, uint256));
        assertEq(fillPrice, 4321);
    }

    // ── A6 — two callbacks in one block on a qualified trigger: one execution ──
    function test_A6_doubleCallbackIdempotent() public {
        _setBook(pool, 5900, 6100, 300e6);
        uint256 id = _arm(alice, _defaultParams()); // dwell 30
        _fill(); // -> OBSERVING
        vm.warp(block.timestamp + 31); // dwell elapsed

        vm.recordLogs();
        _fill(); // OrderFilled callback -> executes
        _scheduledTick(); // dwell-expiry tick lands the SAME block -> must be a no-op
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(uint8(_state(id)), uint8(TriggerState.EXECUTED));
        assertEq(_safe(), 10 ether);

        bytes32 executed = ThresholdHandler.TriggerExecuted.selector;
        bytes32 derisked = DemoVault.Derisked.selector;
        uint256 nExecuted;
        uint256 nDerisked;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == executed) nExecuted++;
            if (logs[i].topics[0] == derisked) nDerisked++;
        }
        assertEq(nExecuted, 1, "exactly one TriggerExecuted");
        assertEq(nDerisked, 1, "exactly one Derisked");
    }

    // ── I3 — a trigger never executes while marketNonce != pinnedNonce ──────
    function test_I3_nonceMismatchNeverExecutes() public {
        _setBook(pool, 5900, 6100, 300e6);
        pool.setMarketNonce(7);
        uint256 id = _arm(alice, _defaultParams());
        assertEq(registry.get(id).pinnedNonce, 7);

        // pool recycled onto a new market before the dwell even starts
        pool.setMarketNonce(8);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.EXPIRED));

        // and it stays dead no matter how many fills / how much time
        vm.warp(block.timestamp + 1000);
        _fill();
        _scheduledTick();
        assertEq(uint8(_state(id)), uint8(TriggerState.EXPIRED));
        assertEq(_safe(), 0);
    }

    // ── scheduled dwell-expiry: a trigger fires in a SILENT book ────────────
    function test_dwellCompletesViaScheduledTick() public {
        _setBook(pool, 5900, 6100, 300e6);
        uint256 id = _arm(alice, _defaultParams()); // dwell 30

        // one fill crosses the threshold and schedules the expiry tick...
        vm.recordLogs();
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool scheduled;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == ThresholdRegistry.DwellExpiryScheduled.selector) {
                scheduled = true;
            }
        }
        assertTrue(scheduled, "OBSERVING entry must schedule a dwell-expiry tick");

        // ...then the book goes completely quiet. No more fills.
        vm.warp(block.timestamp + 31);
        _scheduledTick(); // the precompile delivers the scheduled tick
        assertEq(uint8(_state(id)), uint8(TriggerState.EXECUTED), "fires with zero further fills");
        assertEq(_safe(), 10 ether);
    }

    // ── scheduled tick re-validates the gates (not a blind execute) ─────────
    function test_scheduledTickReValidates() public {
        _setBook(pool, 5900, 6100, 300e6);
        uint256 id = _arm(alice, _defaultParams());
        _fill(); // -> OBSERVING

        // book collapses to one-sided during the quiet window
        _setMultiBook(_u16(5900), _u128(300e6), _emptyU16(), _emptyU128());
        vm.warp(block.timestamp + 31);
        _scheduledTick();

        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED), "re-validated: gate fail resets");
        assertEq(_safe(), 0);
    }

    // ── I5 — 16 triggers, one callback, total gas < 10,000,000 ──────────────
    function test_I5_sixteenTriggersUnderTenMillionGas_freshQualify() public {
        _setBook(pool, 5900, 6100, 400e6);
        for (uint256 i; i < 16; ++i) {
            CreateParams memory p = _defaultParams();
            p.thresholdBps = uint16(4000 + i * 100); // all below the ~0.60 mid -> all qualify
            _arm(alice, p);
        }

        bytes32[] memory topics = new bytes32[](1);
        topics[0] = registry.ORDER_FILLED_TOPIC0();
        vm.prank(PRECOMPILE);
        uint256 g0 = gasleft();
        handler.onEvent(address(pool), topics, ""); // 16x ARMED->OBSERVING + 16x schedule
        uint256 used = g0 - gasleft();

        emit log_named_uint("gas: 16 triggers, fresh-qualify callback", used);
        assertLt(used, 10_000_000, "I5: must fit the 10M subscription gas limit");
    }

    function test_I5_sixteenTriggersUnderTenMillionGas_allExecute() public {
        _setBook(pool, 5900, 6100, 400e6);
        for (uint256 i; i < 16; ++i) {
            CreateParams memory p = _defaultParams();
            p.thresholdBps = uint16(4000 + i * 100);
            _arm(alice, p);
        }
        _fill(); // -> all OBSERVING
        vm.warp(block.timestamp + 31); // dwell elapsed for all

        bytes32[] memory topics = new bytes32[](1);
        topics[0] = registry.ORDER_FILLED_TOPIC0();
        vm.prank(PRECOMPILE);
        uint256 g0 = gasleft();
        handler.onEvent(address(pool), topics, ""); // 16x evaluate + dispatch
        uint256 used = g0 - gasleft();

        emit log_named_uint("gas: 16 triggers, all-execute callback", used);
        assertLt(used, 10_000_000, "I5: must fit the 10M subscription gas limit");
        assertEq(_safe(), 10 ether); // first derisk swept it; rest derisk 0
    }

    // ── a dwell-expiry scheduling failure is swallowed, never reverts ───────
    function test_scheduleDwellExpirySwallowsFailure() public {
        vm.prank(address(handler));
        // 1 ms is in the past -> SomniaExtensions.TimestampInPast, caught inside the registry
        vm.expectEmit(false, false, false, true, address(registry));
        emit ThresholdRegistry.DwellExpiryScheduleFailed(1);
        registry.scheduleDwellExpiry(1);
    }

    // ── with scheduling unavailable, the trigger still fires FILL-DRIVEN (FALLBACK) ──
    function test_fillDrivenWhenSchedulingUnavailable() public {
        _setBook(pool, 5900, 6100, 300e6);
        uint256 id = _arm(alice, _defaultParams()); // subscribe OK (mocked)

        // now every precompile `subscribe` (incl. the schedule variant) reverts
        vm.mockCallRevert(
            PRECOMPILE,
            abi.encodeWithSelector(ISomniaReactivityPrecompile.subscribe.selector),
            "no scheduling"
        );

        _fill(); // OBSERVING; the schedule attempt reverts but the registry swallows it
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING), "callback still completed");

        vm.warp(block.timestamp + 31);
        _fill(); // fill-driven dwell completion
        assertEq(uint8(_state(id)), uint8(TriggerState.EXECUTED));
        assertEq(_safe(), 10 ether);
    }
}
