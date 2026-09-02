// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Base } from "../Base.t.sol";
import { ThresholdHandler } from "../../src/ThresholdHandler.sol";
import { DemoVault } from "../../src/DemoVault.sol";
import { CreateParams, Direction, TriggerState } from "../../src/Types.sol";

/// @notice docs/12 U18–U20 — the gate + dwell state machine, driven through the handler.
contract StateMachineTest is Base {
    function _qualifyingBook() internal {
        // depth-weighted mid ~0.60, 200-bps spread, deep both sides
        _setBook(pool, 5900, 6100, 300e6);
    }

    function _disqualifyingBook() internal {
        // mid ~0.30 — below a 0.50 ABOVE threshold
        _setBook(pool, 2900, 3100, 300e6);
    }

    // ── U18 — full happy path ARMED → OBSERVING → EXECUTED ───────────────────
    function test_U18_happyPath() public {
        _qualifyingBook();
        CreateParams memory p = _defaultParams(); // threshold 5000 ABOVE, dwell 30
        uint256 id = _arm(alice, p);
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED));

        _fill(); // crosses threshold
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));
        assertEq(registry.get(id).dwellStart, uint64(block.timestamp));

        vm.warp(block.timestamp + 20);
        _fill(); // still observing — dwell not elapsed
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));

        vm.warp(block.timestamp + 11); // now 31s in — dwell elapsed
        assertEq(_safe(), 0);
        _fill();

        assertEq(uint8(_state(id)), uint8(TriggerState.EXECUTED));
        assertEq(_safe(), 10 ether, "derisk moved risky -> safe");
        assertEq(vault.riskyBalance(), 0);
    }

    // ── U19 — dwell reset on disqualification: dwellStart == 0, state ARMED ───
    function test_U19_dwellResetOnDisqualification() public {
        _qualifyingBook();
        uint256 id = _arm(alice, _defaultParams());

        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));

        _disqualifyingBook();
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED), "back to ARMED");
        assertEq(registry.get(id).dwellStart, 0, "dwell reset");

        // re-qualifying starts a fresh dwell, not a resumed one
        _qualifyingBook();
        vm.warp(block.timestamp + 100);
        _fill();
        assertEq(registry.get(id).dwellStart, uint64(block.timestamp));
    }

    // ── U20 — recurring respects cooldown ────────────────────────────────────
    function test_U20_recurringCooldown() public {
        _qualifyingBook();
        CreateParams memory p = _defaultParams();
        p.recurring = true;
        p.dwellSec = 10;
        p.cooldownSec = 60;
        uint256 id = _arm(alice, p);

        _fill(); // -> OBSERVING
        vm.warp(block.timestamp + 11);
        _fill(); // dwell elapsed -> execute, recurring -> back to ARMED
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED));
        assertEq(_safe(), 10 ether);
        uint64 firstExec = registry.get(id).lastExecutedAt;

        // top the vault back up and try again inside the cooldown window
        vault.deposit{ value: 5 ether }();
        _fill(); // -> OBSERVING
        vm.warp(block.timestamp + 11);
        _fill(); // dwell elapsed but within cooldown -> no execution
        assertEq(_safe(), 10 ether, "blocked by cooldown");
        assertEq(registry.get(id).lastExecutedAt, firstExec);

        // past the cooldown -> executes again
        vm.warp(firstExec + 61);
        _fill();
        assertEq(_safe(), 15 ether);
    }

    // ── BELOW direction ─────────────────────────────────────────────────────
    function test_belowDirection() public {
        _disqualifyingBook(); // mid ~0.30
        CreateParams memory p = _defaultParams();
        p.direction = Direction.BELOW;
        p.thresholdBps = 4000; // fire when P <= 0.40
        uint256 id = _arm(alice, p);

        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));
        vm.warp(block.timestamp + 31);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.EXECUTED));
    }

    // ── gate G7 spread rejects while ARMED ───────────────────────────────────
    function test_G7_wideSpreadDisqualifies() public {
        _setBook(pool, 5000, 7000, 300e6); // 2000-bps spread, mid 0.60
        CreateParams memory p = _defaultParams();
        p.maxSpreadBps = 500;
        uint256 id = _arm(alice, p);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED), "wide spread never qualifies");
    }

    // ── gate G8 thin book rejects (the manipulation guard, A4/A11) ───────────
    function test_G8_thinBookDisqualifies() public {
        _setBook(pool, 5900, 6100, 5e6); // mid 0.60 but only 5 collateral/side
        CreateParams memory p = _defaultParams();
        p.minDepthPerSide = 100e6;
        uint256 id = _arm(alice, p);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED), "thin book never qualifies");
    }

    // ── terminal states are terminal ────────────────────────────────────────
    function test_executedIsTerminal() public {
        _qualifyingBook();
        uint256 id = _arm(alice, _defaultParams());
        _fill();
        vm.warp(block.timestamp + 31);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.EXECUTED));

        vault.deposit{ value: 1 ether }();
        _fill(); // must be a no-op
        assertEq(uint8(_state(id)), uint8(TriggerState.EXECUTED));
        assertEq(vault.riskyBalance(), 1 ether, "no second derisk");
    }
}
