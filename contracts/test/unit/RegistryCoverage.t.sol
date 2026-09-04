// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Base } from "../Base.t.sol";
import { ThresholdRegistry } from "../../src/ThresholdRegistry.sol";
import { CreateParams, Direction, TriggerState } from "../../src/Types.sol";
import { MockBinaryPool } from "../mocks/MockBinaryPool.sol";

/// @notice PHASE 9 — closes the coverage gap on ThresholdRegistry: admin utilities, the
///         permissionless prune path, cancel-on-terminal, the multi-pool unsubscribe swap, direct
///         funding, and the `nonReentrant` guard actually firing (not just its happy path).

/// @dev A pool whose `finalized()` (called as `view` through IBinaryPool, so the registry issues a
///      STATICCALL) tries to re-enter `createTrigger` while the outer call still holds the lock.
///      The reentrant call is a plain zero-value CALL — permitted under a static context — so it
///      reaches the `nonReentrant` modifier and must hit `revert Reentrancy()` there (a REVERT
///      needs no write permission). Caught locally so the outer, legitimate call still succeeds.
///      `finalized()` itself must stay a true STATICCALL guest — no SSTORE/LOG, or the *outer*
///      call reverts before the reentrancy attempt ever happens — so there is no local flag; the
///      test instead proves the attempt failed by checking `nextTriggerId` never moved past 1.
///      Implements only the three pool reads `createTrigger` performs at arm time — evaluation
///      (snapshot) is never exercised on this trigger, so the rest of IBinaryPool is unneeded.
contract ReentrantPool {
    ThresholdRegistry public reg;
    CreateParams internal replay;

    function arm(ThresholdRegistry _reg, CreateParams calldata p) external {
        reg = _reg;
        replay = p;
    }

    function finalized() external returns (bool) {
        if (address(reg) != address(0)) {
            try reg.createTrigger(replay) {
            // must not happen: the outer call is still locked
            }
                catch {
                // expected: ThresholdRegistry.Reentrancy() — swallowed, no state touched
            }
        }
        return false;
    }

    function booksEmpty() external pure returns (bool) {
        return false;
    }

    function marketNonce() external pure returns (uint64) {
        return 1;
    }
}

contract RegistryCoverageTest is Base {
    // ── setSubscriptionOptions ───────────────────────────────────────────────
    function test_setSubscriptionOptions() public {
        vm.expectEmit(false, false, false, true, address(registry));
        emit ThresholdRegistry.SubscriptionOptionsSet(2 gwei, 25 gwei, 20_000_000);
        registry.setSubscriptionOptions(2 gwei, 25 gwei, 20_000_000);

        assertEq(registry.subPriorityFeePerGas(), 2 gwei);
        assertEq(registry.subMaxFeePerGas(), 25 gwei);
        assertEq(registry.subGasLimit(), 20_000_000);
    }

    function test_setSubscriptionOptions_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.NotAdmin.selector);
        registry.setSubscriptionOptions(1 gwei, 20 gwei, 10_000_000);
    }

    // ── emergencyUnsubscribeAll + the multi-pool unsubscribe swap ───────────
    function test_emergencyUnsubscribeAll() public {
        MockBinaryPool pool2 = new MockBinaryPool();
        _setBook(pool2, 3900, 4100, 200e6);

        _arm(alice, _defaultParams()); // pool 1
        CreateParams memory p2 = _defaultParams();
        p2.pool = address(pool2);
        _arm(alice, p2); // pool 2

        assertEq(registry.getSubscribedPools().length, 2);
        assertTrue(registry.poolSubscriptionId(address(pool)) != 0);
        assertTrue(registry.poolSubscriptionId(address(pool2)) != 0);

        registry.emergencyUnsubscribeAll();

        assertEq(registry.getSubscribedPools().length, 0);
        assertEq(registry.poolSubscriptionId(address(pool)), 0);
        assertEq(registry.poolSubscriptionId(address(pool2)), 0);
    }

    function test_emergencyUnsubscribeAll_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.NotAdmin.selector);
        registry.emergencyUnsubscribeAll();
    }

    /// @dev Two subscribed pools, unsubscribe the FIRST one — exercises `_unsubscribe`'s
    ///      swap-with-last branch in `_subscribedPools` (not just the trivial one-pool case).
    function test_unsubscribe_swapsWithLastInArray() public {
        MockBinaryPool pool2 = new MockBinaryPool();
        _setBook(pool2, 3900, 4100, 200e6);

        uint256 id1 = _arm(alice, _defaultParams()); // index 0
        CreateParams memory p2 = _defaultParams();
        p2.pool = address(pool2);
        _arm(alice, p2); // index 1

        vm.prank(alice);
        registry.cancelTrigger(id1); // last active trigger on `pool` -> unsubscribes index 0

        address[] memory left = registry.getSubscribedPools();
        assertEq(left.length, 1);
        assertEq(left[0], address(pool2), "pool2 must have been swapped into slot 0");
        assertEq(registry.poolSubscriptionId(address(pool)), 0);
        assertTrue(registry.poolSubscriptionId(address(pool2)) != 0);
    }

    // ── pruneSubscription ─────────────────────────────────────────────────
    function test_pruneSubscription_noOpWhileActive() public {
        _arm(alice, _defaultParams());
        uint256 subBefore = registry.poolSubscriptionId(address(pool));

        registry.pruneSubscription(address(pool)); // permissionless

        assertEq(registry.poolSubscriptionId(address(pool)), subBefore, "still active, no-op");
    }

    /// @dev A trigger reaching a terminal state via the handler does NOT auto-unsubscribe —
    ///      `pruneSubscription` is exactly the permissionless cleanup for that dangling case.
    function test_pruneSubscription_removesDanglingSubscription() public {
        uint256 id = _arm(alice, _defaultParams());
        assertTrue(registry.poolSubscriptionId(address(pool)) != 0);

        vm.prank(address(handler));
        registry.applyEvaluation(id, TriggerState.EXECUTED, 0);
        assertTrue(registry.poolSubscriptionId(address(pool)) != 0, "not auto-unsubscribed");

        registry.pruneSubscription(address(pool));
        assertEq(registry.poolSubscriptionId(address(pool)), 0);
    }

    // ── cancelTrigger on a terminal trigger reverts NotCancellable ──────────
    function test_cancelTrigger_alreadyTerminal() public {
        uint256 id = _arm(alice, _defaultParams());
        vm.prank(address(handler));
        registry.applyEvaluation(id, TriggerState.EXPIRED, 0);

        vm.prank(alice);
        vm.expectRevert(ThresholdRegistry.NotCancellable.selector);
        registry.cancelTrigger(id);
    }

    function test_cancelTrigger_unknownId() public {
        vm.expectRevert(ThresholdRegistry.TriggerNotFound.selector);
        registry.cancelTrigger(999);
    }

    // ── triggersByOwner view ─────────────────────────────────────────────
    function test_triggersByOwner() public {
        uint256 id = _arm(alice, _defaultParams());
        uint256[] memory mine = registry.triggersByOwner(alice);
        assertEq(mine.length, 1);
        assertEq(mine[0], id);
        assertEq(registry.triggersByOwner(bob).length, 0);
    }

    // ── receive() — a plain STT transfer, not just vm.deal ──────────────────
    function test_receive_emitsFunded() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit ThresholdRegistry.Funded(address(this), 1 ether);
        (bool ok,) = address(registry).call{ value: 1 ether }("");
        assertTrue(ok);
    }

    // ── the nonReentrant guard actually reverting, not just its happy path ──
    function test_nonReentrant_blocksReentrantCreateTrigger() public {
        ReentrantPool rp = new ReentrantPool();

        CreateParams memory p = _defaultParams();
        p.pool = address(rp);
        rp.arm(registry, p);

        // the outer call succeeds; the nested reentrant attempt inside finalized() must have
        // hit `Reentrancy()` and been swallowed by the pool's own try/catch — proven by
        // `nextTriggerId` staying at 1 (a successful reentrant call would have made it 2).
        uint256 id = _arm(alice, p);
        assertEq(uint8(_state(id)), uint8(TriggerState.ARMED));
        assertEq(registry.nextTriggerId(), 1, "the reentrant createTrigger must not have landed");
    }
}
