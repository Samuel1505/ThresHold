// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Base } from "../Base.t.sol";
import { CreateParams, TriggerState } from "../../src/Types.sol";

/// @dev Spins forever — burns every unit of gas it's forwarded, however much that is.
contract GasGuzzler {
    uint256 public counter;

    function burn() external {
        while (true) {
            unchecked {
                counter++;
            }
        }
    }
}

/// @notice docs/12 A9, A12 — the two adversarial tests PHASE 9 had left unwritten.
contract GasAndExpiryTest is Base {
    // ── A9 — a target that consumes unbounded gas: capped, loop continues (I7) ──
    function test_A9_unboundedGasTargetIsCapped() public {
        GasGuzzler guzzler = new GasGuzzler();
        registry.setActionAllowed(address(guzzler), GasGuzzler.burn.selector, true);

        _setBook(pool, 5900, 6100, 300e6);

        // trigger 1: targets the guzzler, a tight gas cap
        CreateParams memory pBad = _defaultParams();
        pBad.target = address(guzzler);
        pBad.selector = GasGuzzler.burn.selector;
        pBad.actionGasCap = 100_000;
        uint256 idBad = _arm(alice, pBad);

        // trigger 2: the normal DemoVault action, on the same pool/callback
        CreateParams memory pGood = _defaultParams();
        uint256 idGood = _arm(alice, pGood);

        _fill(); // both -> OBSERVING
        vm.warp(block.timestamp + 31);

        uint256 gasBefore = gasleft();
        _fill(); // dwell elapsed for both — the guzzler must not blow the callback's budget
        uint256 used = gasBefore - gasleft();

        // the whole callback (two evaluations, one of them an infinite loop capped at 100k)
        // must fit comfortably inside the subscription's 10M-gas ceiling
        assertLt(used, 2_000_000, "the guzzler must not consume unbounded callback gas");

        assertEq(uint8(_state(idBad)), uint8(TriggerState.FAILED), "capped call reverts -> FAILED");
        assertEq(
            uint8(_state(idGood)),
            uint8(TriggerState.EXECUTED),
            "the good trigger is unaffected (I7)"
        );
        assertEq(_safe(), 10 ether);
    }

    // ── A12 — market expires mid-dwell: EXPIRED, no execution ───────────────────
    function test_A12_marketExpiresDuringDwell() public {
        _setBook(pool, 5900, 6100, 300e6);
        pool.setMarketExpiryNs(uint64((block.timestamp + 20) * 1e9)); // expires in 20s

        uint256 id = _arm(alice, _defaultParams()); // dwell 30s > time-to-expiry
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));

        // the market's own expiry passes before the dwell would have elapsed
        vm.warp(block.timestamp + 25);
        _fill();

        assertEq(uint8(_state(id)), uint8(TriggerState.EXPIRED), "past marketExpiryNs -> EXPIRED");
        assertEq(_safe(), 0, "must not execute on an expired market");

        // and it stays dead — more time, more fills, nothing changes it
        vm.warp(block.timestamp + 1000);
        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.EXPIRED));
    }

    /// @dev Same shape, but the trigger's own `expiresAt` deadline (not the market's) passes.
    function test_A12b_triggerDeadlineDuringDwell() public {
        _setBook(pool, 5900, 6100, 300e6);
        CreateParams memory p = _defaultParams();
        p.expiresAt = uint64(block.timestamp + 20);
        uint256 id = _arm(alice, p);

        _fill();
        assertEq(uint8(_state(id)), uint8(TriggerState.OBSERVING));

        vm.warp(block.timestamp + 25);
        _fill();

        assertEq(uint8(_state(id)), uint8(TriggerState.EXPIRED));
        assertEq(_safe(), 0);
    }
}
