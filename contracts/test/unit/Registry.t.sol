// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Base } from "../Base.t.sol";
import { ThresholdRegistry } from "../../src/ThresholdRegistry.sol";
import { CreateParams, Direction, TriggerState } from "../../src/Types.sol";

/// @notice docs/12 U10–U17, U21 — registry validation and access control.
contract RegistryTest is Base {
    // ── U10 — createTrigger pins marketNonce ─────────────────────────────────
    function test_U10_pinsMarketNonce() public {
        pool.setMarketNonce(42);
        uint256 id = _arm(alice, _defaultParams());
        assertEq(registry.get(id).pinnedNonce, 42);
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED));
    }

    // ── U11 — threshold 0 or 10000 reverts InvalidThreshold ──────────────────
    function test_U11_thresholdBounds() public {
        CreateParams memory p = _defaultParams();
        p.thresholdBps = 0;
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.InvalidThreshold.selector);
        registry.createTrigger(p);

        p.thresholdBps = 10_000;
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.InvalidThreshold.selector);
        registry.createTrigger(p);
    }

    // ── U12 — dwell out of bounds reverts InvalidDwell ───────────────────────
    function test_U12_dwellBounds() public {
        CreateParams memory p = _defaultParams();
        p.dwellSec = 4; // < MIN_DWELL_SEC (5)
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.InvalidDwell.selector);
        registry.createTrigger(p);

        p.dwellSec = 3601; // > MAX_DWELL_SEC (3600)
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.InvalidDwell.selector);
        registry.createTrigger(p);
    }

    function test_U12_recurringCooldownBelowDwell() public {
        CreateParams memory p = _defaultParams();
        p.recurring = true;
        p.dwellSec = 30;
        p.cooldownSec = 29;
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.InvalidDwell.selector);
        registry.createTrigger(p);
    }

    // ── U13 — non-allow-listed action reverts ActionNotAllowed ───────────────
    function test_U13_actionNotAllowed() public {
        CreateParams memory p = _defaultParams();
        p.selector = bytes4(0xdeadbeef);
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.ActionNotAllowed.selector);
        registry.createTrigger(p);
    }

    function test_U13_denylistedTargets() public {
        CreateParams memory p = _defaultParams();
        p.target = address(registry);
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.ActionNotAllowed.selector);
        registry.createTrigger(p);

        p.target = address(handler);
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.ActionNotAllowed.selector);
        registry.createTrigger(p);
    }

    function test_U13_adminCannotAllowlistRegistryOrHandler() public {
        vm.expectRevert(ThresholdRegistry.ActionNotAllowed.selector);
        registry.setActionAllowed(address(registry), DERISK_SEL, true);
        vm.expectRevert(ThresholdRegistry.ActionNotAllowed.selector);
        registry.setActionAllowed(address(handler), DERISK_SEL, true);
        vm.expectRevert(ThresholdRegistry.ActionNotAllowed.selector);
        registry.setActionAllowed(PRECOMPILE, DERISK_SEL, true);
    }

    // ── U14 — gas cap > MAX_ACTION_GAS reverts GasCapTooHigh ─────────────────
    function test_U14_gasCap() public {
        CreateParams memory p = _defaultParams();
        p.actionGasCap = registry.MAX_ACTION_GAS() + 1;
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.GasCapTooHigh.selector);
        registry.createTrigger(p);

        p.actionGasCap = 0;
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.GasCapTooHigh.selector);
        registry.createTrigger(p);
    }

    // ── U15 — 17th trigger on a pool reverts PoolTriggerLimit ────────────────
    function test_U15_poolTriggerLimit() public {
        CreateParams memory p = _defaultParams();
        for (uint256 i; i < registry.MAX_TRIGGERS_PER_POOL(); ++i) {
            _arm(alice, p);
        }
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.PoolTriggerLimit.selector);
        registry.createTrigger(p);
    }

    // ── U16 — cancel by non-owner reverts NotOwner ───────────────────────────
    function test_U16_cancelByNonOwner() public {
        uint256 id = _arm(alice, _defaultParams());
        vm.prank(bob);
        vm.expectRevert(ThresholdRegistry.NotOwner.selector);
        registry.cancelTrigger(id);
    }

    function test_U16_cancelHappyPath() public {
        uint256 id = _arm(alice, _defaultParams());
        assertTrue(registry.poolSubscriptionId(address(pool)) != 0);
        vm.prank(alice);
        registry.cancelTrigger(id);
        assertEq(uint8(_state(id)), uint8(TriggerState.CANCELLED));
        // last trigger on the pool → unsubscribed
        assertEq(registry.poolSubscriptionId(address(pool)), 0);
    }

    // ── U17 — state mutation by non-handler reverts NotHandler ───────────────
    function test_U17_stateMutationByNonHandler() public {
        uint256 id = _arm(alice, _defaultParams());
        vm.expectRevert(ThresholdRegistry.NotHandler.selector);
        registry.applyEvaluation(id, TriggerState.EXECUTED, 0);
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.NotHandler.selector);
        registry.recordExecution(id, 5000, true, uint64(block.timestamp));
    }

    // ── U21 — withdrawSurplus below 32 ether reverts (I9) ────────────────────
    function test_U21_withdrawSurplusFloor() public {
        // registry holds 40 ether. Withdrawing 8 leaves exactly 32 — OK.
        registry.withdrawSurplus(8 ether);
        assertEq(address(registry).balance, 32 ether);
        // any further withdrawal breaks the floor
        vm.expectRevert(ThresholdRegistry.InsufficientSubscriptionBalance.selector);
        registry.withdrawSurplus(1);
    }

    function test_admin_onlyAdminGuards() public {
        vm.startPrank(alice);
        vm.expectRevert(ThresholdRegistry.NotAdmin.selector);
        registry.setPaused(true);
        vm.expectRevert(ThresholdRegistry.NotAdmin.selector);
        registry.setActionAllowed(address(vault), DERISK_SEL, false);
        vm.expectRevert(ThresholdRegistry.NotAdmin.selector);
        registry.withdrawSurplus(1);
        vm.stopPrank();
    }

    function test_pausedBlocksCreate() public {
        registry.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.ContractPaused.selector);
        registry.createTrigger(_defaultParams());
    }

    function test_handlerSetOnce() public {
        vm.expectRevert(ThresholdRegistry.HandlerAlreadySet.selector);
        registry.setHandler(address(0xBEEF));
    }

    function test_createTrigger_rejectsFinalizedPool() public {
        pool.setFinalized(true);
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.MarketNotTradable.selector);
        registry.createTrigger(_defaultParams());
    }

    function test_oneSubscriptionPerPool() public {
        _arm(alice, _defaultParams());
        uint256 sub1 = registry.poolSubscriptionId(address(pool));
        _arm(bob, _defaultParams());
        assertEq(registry.poolSubscriptionId(address(pool)), sub1, "must reuse the subscription");
        assertEq(registry.getSubscribedPools().length, 1);
    }
}
