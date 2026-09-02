// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    SomniaEventHandler
} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import { IBinaryPool } from "./interfaces/IBinaryPool.sol";
import { ProbabilityLib } from "./ProbabilityLib.sol";
import { ThresholdRegistry } from "./ThresholdRegistry.sol";
import { Trigger, Direction, TriggerState } from "./Types.sol";

/// @title ThresholdHandler — the only precompile-callable surface (docs/04, docs/08)
/// @notice Receives `OrderFilled` callbacks, re-reads the book on-chain (never trusts the event
///         payload), runs gates G1–G8 + the dwell state machine, and dispatches the action.
///         Deliberately minimal and stateless — it holds no value and cannot be bricked.
contract ThresholdHandler is SomniaEventHandler {
    using ProbabilityLib for ProbabilityLib.PoolSnapshot;

    ThresholdRegistry public immutable registry;

    /// @notice Per-side book-level cap. 8 for the MVP — meaningful, bounded for gas (docs/07 §7).
    uint64 public constant MAX_LEVELS = 8;
    address internal constant PRECOMPILE = address(0x0100);

    /// @dev Emitted on EVERY callback entry, before any logic — a silent callback failure is
    ///      otherwise undiagnosable (CLAUDE.md, docs/18).
    event CallbackEntered(address indexed emitter, bytes32 topic0, uint256 triggerCount);
    event ScheduledTick(uint256 poolCount);
    event GateFailed(uint256 indexed id, uint8 gate);
    event DwellStarted(uint256 indexed id, uint64 dwellStart, uint32 dwellSec);
    event DwellReset(uint256 indexed id);
    event TriggerExpired(uint256 indexed id, uint8 reason); // 1 = nonce, 2 = finalized/expired
    /// @notice The event the frontend watches (docs/03). `returndataHash` = keccak256 of the
    ///         action call's return data.
    event TriggerExecuted(
        uint256 indexed id, uint16 probabilityBps, bool success, bytes32 returndataHash
    );
    event TriggerEvaluationFailed(uint256 indexed id);

    error OnlySelf();

    constructor(ThresholdRegistry _registry) {
        registry = _registry;
    }

    // ─────────────────────────────────────────────────────── callback entry ──

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata /*data*/
    )
        internal
        override
    {
        bytes32 topic0 = eventTopics.length != 0 ? eventTopics[0] : bytes32(0);

        // A time-based dwell-expiry tick is delivered by the precompile itself (emitter = 0x0100).
        if (emitter == PRECOMPILE) {
            _onScheduledTick();
            return;
        }

        uint256[] memory ids = registry.triggersByPool(emitter);
        emit CallbackEntered(emitter, topic0, ids.length);
        if (ids.length == 0) return; // not a pool we watch — silent

        // Read the book ONCE, share across every trigger on this pool.
        ProbabilityLib.PoolSnapshot memory snap =
            ProbabilityLib.snapshot(IBinaryPool(emitter), MAX_LEVELS);

        _evaluateAll(ids, snap);
    }

    /// @dev Re-evaluate every trigger on every watched pool. Used by the scheduled dwell-expiry
    ///      tick so a trigger is checked at least once at dwell end even in a silent book.
    function _onScheduledTick() internal {
        address[] memory pools = registry.getSubscribedPools();
        emit ScheduledTick(pools.length);
        for (uint256 i; i < pools.length; ++i) {
            uint256[] memory ids = registry.triggersByPool(pools[i]);
            if (ids.length == 0) continue;
            ProbabilityLib.PoolSnapshot memory snap =
                ProbabilityLib.snapshot(IBinaryPool(pools[i]), MAX_LEVELS);
            _evaluateAll(ids, snap);
        }
    }

    function _evaluateAll(uint256[] memory ids, ProbabilityLib.PoolSnapshot memory snap) internal {
        uint256 latestDwellEnd; // schedule ONE expiry tick per callback (gas bound — I5)
        for (uint256 i; i < ids.length; ++i) {
            // Per-trigger isolation: one malformed trigger must not block the other fifteen (I7).
            try this.evaluateExternal(ids[i], snap) returns (uint64 dwellEnd) {
                if (dwellEnd > latestDwellEnd) latestDwellEnd = dwellEnd;
            } catch {
                emit TriggerEvaluationFailed(ids[i]);
            }
        }
        // At most one scheduled subscription per callback, at the latest dwell end among the
        // triggers that just entered OBSERVING. The tick re-evaluates every trigger, so a shorter
        // dwell is still covered; any fill in the meantime evaluates it earlier regardless.
        if (latestDwellEnd != 0) _scheduleDwellExpiry(latestDwellEnd);
    }

    /// @notice `onlySelf` re-entry so each trigger evaluates in its own call frame (docs/08).
    /// @return dwellEnd non-zero (unix seconds) if this trigger just entered OBSERVING — the
    ///         caller schedules a single expiry tick for the callback.
    function evaluateExternal(uint256 id, ProbabilityLib.PoolSnapshot calldata snap)
        external
        returns (uint64 dwellEnd)
    {
        if (msg.sender != address(this)) revert OnlySelf();
        return _evaluate(id, snap);
    }

    // ─────────────────────────────────────────────── the gate + dwell machine ──

    function _evaluate(uint256 id, ProbabilityLib.PoolSnapshot memory snap)
        internal
        returns (uint64 dwellEnd)
    {
        Trigger memory t = registry.get(id);

        // G1 — armed?
        if (t.state != TriggerState.ARMED && t.state != TriggerState.OBSERVING) return 0;

        // G2 — market identity. The pool was recycled onto a different market.
        if (t.pinnedNonce != snap.marketNonce) {
            registry.applyEvaluation(id, TriggerState.EXPIRED, 0);
            emit TriggerExpired(id, 1);
            return 0;
        }

        // G3 / G4 — finalized or past expiry (pool's own, or the trigger's absolute deadline).
        bool pastDeadline = t.expiresAt != 0 && block.timestamp >= t.expiresAt;
        if (snap.finalized || snap.expired || pastDeadline) {
            registry.applyEvaluation(id, TriggerState.EXPIRED, 0);
            emit TriggerExpired(id, 2);
            return 0;
        }

        // G5 / G6 — book present and two-sided.
        if (snap.booksEmpty || !snap.twoSided) {
            _disqualify(id, t, 6);
            return 0;
        }

        // G7 — spread.
        if (snap.spreadBps > t.maxSpreadBps) {
            _disqualify(id, t, 7);
            return 0;
        }

        // G8 — depth per side, and the signal, in one walk of the book (docs/07 §3.2).
        (uint16 p, bool bidDeep, bool askDeep) = snap.depthWeightedBps(t.minDepthPerSide);
        if (!bidDeep || !askDeep) {
            _disqualify(id, t, 8);
            return 0;
        }

        if (!ProbabilityLib.qualifies(p, t.thresholdBps, t.direction)) {
            _disqualify(id, t, 0);
            return 0;
        }

        // Qualified.
        if (t.state == TriggerState.ARMED) {
            uint64 start = uint64(block.timestamp);
            registry.applyEvaluation(id, TriggerState.OBSERVING, start);
            emit DwellStarted(id, start, t.dwellSec);
            return start + t.dwellSec; // caller schedules one expiry tick for the whole callback
        }

        // OBSERVING + still qualified — has the dwell elapsed?
        if (block.timestamp - t.dwellStart < t.dwellSec) return 0;

        // Recurring cooldown — only meaningful once it has fired at least once.
        if (
            t.recurring && t.lastExecutedAt != 0
                && block.timestamp < uint256(t.lastExecutedAt) + t.cooldownSec
        ) return 0;

        _execute(id, t, p);
        return 0;
    }

    /// @dev Not qualified, or a gate failed while active — reset the dwell (never accumulate it
    ///      across disqualifying gaps, docs/08).
    function _disqualify(uint256 id, Trigger memory t, uint8 gate) internal {
        if (gate != 0) emit GateFailed(id, gate);
        if (t.state == TriggerState.OBSERVING) {
            registry.applyEvaluation(id, TriggerState.ARMED, 0);
            emit DwellReset(id);
        }
    }

    function _execute(uint256 id, Trigger memory t, uint16 p) internal {
        // EFFECTS BEFORE INTERACTION — a re-entrant target finds the trigger already advanced (I2).
        registry.applyEvaluation(id, t.recurring ? TriggerState.ARMED : TriggerState.EXECUTED, 0);

        bytes memory cd = bytes.concat(t.selector, t.payload);
        (bool ok, bytes memory ret) = t.target.call{ gas: t.actionGasCap }(cd);

        registry.recordExecution(id, p, ok, uint64(block.timestamp));
        if (!ok && !t.recurring) registry.applyEvaluation(id, TriggerState.FAILED, 0);

        emit TriggerExecuted(id, p, ok, keccak256(ret));
    }

    /// @dev Schedule a one-shot precompile tick at dwell end so the trigger evaluates even if the
    ///      book goes quiet (docs/07 §6). The registry owns the subscription (it holds the 32 STT)
    ///      and swallows any failure — Threshold degrades to fill-driven, the documented FALLBACK.
    function _scheduleDwellExpiry(uint256 dwellEndSec) internal {
        uint256 whenMillis = dwellEndSec * 1000;
        // SomniaExtensions requires the timestamp strictly in the future; if dwell end is this
        // block or the next, a fill will catch it anyway — skip the schedule.
        if (whenMillis <= (block.timestamp + 1) * 1000 + 1) return;
        registry.scheduleDwellExpiry(whenMillis);
    }
}
