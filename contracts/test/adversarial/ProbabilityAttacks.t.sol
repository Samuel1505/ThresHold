// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Base } from "../Base.t.sol";
import { LibHarness } from "../mocks/LibHarness.sol";
import { CreateParams, Direction, TriggerState } from "../../src/Types.sol";

/// @notice docs/12 A4, A5, A10, A11 — the tests that show the manipulation guard is real, not a
///         happy-path prototype. PHASE 3 acceptance: A4 proves a single thin-level fill does not
///         move the depth-weighted mid > 100 bps.
contract ProbabilityAttacksTest is Base {
    LibHarness internal lib;

    function setUp() public override {
        super.setUp();
        lib = new LibHarness();
    }

    function _mid(uint128 minDepth) internal view returns (uint16 m) {
        (m,,) = lib.midOf(pool, 8, minDepth);
    }

    // ── A4 — one fill clears a thin top level: touch spikes, depth-mid does not ──
    //
    // Book: a thin level right at the touch, then a gap up to the deep liquidity.
    //   asks: 5010 bps / 5 collateral   (thin, at the touch)
    //         5400 bps / 500 collateral (deep, after a 390-bps gap)
    //   bids: 4990 bps / 500 collateral
    // A trader buys ~5 collateral, clearing the thin ask. The *touch* ask jumps 5010 -> 5400
    // (a 390-bps spike, and a naive touch-mid would cross a 5200 threshold). The depth-weighted
    // mid barely moves, and the armed trigger never leaves ARMED.
    function test_A4_thinLevelClearedDoesNotMoveDepthMid() public {
        uint128 minDepth = 100e6;

        _setMultiBook(_u16(4990), _u128(500e6), _u16(5010, 5400), _u128(5e6, 500e6));
        uint16 midBefore = _mid(minDepth);

        CreateParams memory p = _defaultParams();
        p.thresholdBps = 5200; // ABOVE — a touch-mid spike would cross this
        p.minDepthPerSide = minDepth;
        p.maxSpreadBps = 5000; // don't let G7 mask the point
        uint256 id = _arm(alice, p);

        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED), "must not qualify at rest");

        // the attack: the thin ask level is gone
        _setMultiBook(_u16(4990), _u128(500e6), _u16(5400), _u128(500e6));
        uint16 midAfter = _mid(minDepth);

        uint256 touchBefore = (4990 + 5010) / 2;
        uint256 touchAfter = (4990 + 5400) / 2;
        assertGe(touchAfter - touchBefore, 190, "the touch really did spike"); // ~195 bps

        uint256 delta = midAfter > midBefore ? midAfter - midBefore : midBefore - midAfter;
        assertLt(delta, 100, "depth-weighted mid must move < 100 bps (PHASE 3 acceptance)");

        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED), "the trigger ignores the wash fill");
        assertEq(_safe(), 0, "no execution");
    }

    // ── A4b — even a genuinely deep, tight book: clearing the thin top is < 100 bps ──
    function test_A4b_thinTopTightBook() public {
        _setMultiBook(
            _u16(4880, 4860, 4840),
            _u128(3e6, 300e6, 300e6),
            _u16(5100, 5120, 5140),
            _u128(3e6, 300e6, 300e6)
        );
        uint16 before = _mid(100e6);
        _setMultiBook(_u16(4860, 4840), _u128(300e6, 300e6), _u16(5120, 5140), _u128(300e6, 300e6));
        uint16 afterMid = _mid(100e6);
        uint256 delta = afterMid > before ? afterMid - before : before - afterMid;
        assertLt(delta, 100);
    }

    // ── A5 — probability oscillates across the threshold: dwell resets each time ──
    function test_A5_oscillationNeverExecutes() public {
        CreateParams memory p = _defaultParams(); // threshold 5000 ABOVE, dwell 30
        uint256 id = _arm(alice, p);

        for (uint256 i; i < 6; ++i) {
            // qualify (~0.60) -> OBSERVING
            _setBook(pool, 5900, 6100, 300e6);
            _fill();
            assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));
            vm.warp(block.timestamp + 20); // less than dwellSec

            // fall back below (~0.30) -> ARMED, dwell reset
            _setBook(pool, 2900, 3100, 300e6);
            _fill();
            assertEq(uint8(_state(id)), uint8(TriggerState.ARMED));
            assertEq(registry.get(id).dwellStart, 0);
            vm.warp(block.timestamp + 20);
        }

        // total elapsed >> dwellSec, but no continuous qualifying window ever reached it
        assertEq(_safe(), 0, "oscillation must never execute");
    }

    // ── A10 — book goes one-sided during the dwell: dwell resets ────────────────
    function test_A10_oneSidedDuringDwell() public {
        _setBook(pool, 5900, 6100, 300e6);
        uint256 id = _arm(alice, _defaultParams());
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));

        // maker pulls the entire ask side
        _setMultiBook(_u16(5900), _u128(300e6), _emptyU16(), _emptyU128());
        vm.warp(block.timestamp + 10);
        _fill();

        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED), "one-sided book resets the dwell");
        assertEq(registry.get(id).dwellStart, 0);

        // even letting the full dwell pass on the broken book: nothing fires
        vm.warp(block.timestamp + 60);
        _fill();
        assertEq(_safe(), 0);
    }

    // ── A11 — book thins below minDepthPerSide during the dwell: dwell resets ────
    function test_A11_thinsBelowMinDepthDuringDwell() public {
        CreateParams memory p = _defaultParams();
        p.minDepthPerSide = 100e6;
        _setBook(pool, 5900, 6100, 300e6); // deep enough
        uint256 id = _arm(alice, p);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));

        // liquidity evaporates: same prices, 10 collateral/side (< 100 minDepth)
        _setBook(pool, 5900, 6100, 10e6);
        vm.warp(block.timestamp + 15);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED), "thin book resets the dwell");

        vm.warp(block.timestamp + 60);
        _fill();
        assertEq(_safe(), 0, "must not fire on a book that went thin");

        // liquidity returns -> a FRESH dwell, not a resumed one
        _setBook(pool, 5900, 6100, 300e6);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));
        assertEq(registry.get(id).dwellStart, uint64(block.timestamp));
    }

    // ── A11b — asymmetric: one side deep, the other thin -> still rejected ──────
    function test_A11b_asymmetricDepth() public {
        CreateParams memory p = _defaultParams();
        p.minDepthPerSide = 100e6;
        // bid side deep, ask side thin
        _setMultiBook(_u16(5900), _u128(500e6), _u16(6100), _u128(5e6));
        uint256 id = _arm(alice, p);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED), "thin ask alone disqualifies");
    }
}
