// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Threshold direction — is the trigger armed for the probability rising through the
///         threshold (ABOVE) or falling through it (BELOW).
enum Direction {
    ABOVE,
    BELOW
}

/// @notice Trigger lifecycle (docs/08). `EXECUTED`, `EXPIRED`, `CANCELLED`, `FAILED` are terminal.
enum TriggerState {
    NONE,
    ARMED,
    OBSERVING,
    EXECUTED,
    EXPIRED,
    CANCELLED,
    FAILED
}

/// @notice A single armed automation. Stored in the registry; read into memory by the handler.
///         Field-ordering notes (docs/04): `pinnedNonce` is gate G2, `maxSpreadBps` +
///         `minDepthPerSide` make manipulation resistance per-trigger, `selector` is stored apart
///         from `payload` so the allow-list is on `(target, selector)` and a caller cannot swap the
///         function, `actionGasCap` bounds griefing, `expiresAt` forbids an immortal trigger.
struct Trigger {
    address owner;
    address pool; // BinaryPool address
    uint64 pinnedNonce; // marketNonce() at arm time — GATE G2
    uint16 thresholdBps; // 1..9999
    Direction direction;
    uint32 dwellSec;
    uint16 maxSpreadBps;
    uint128 minDepthPerSide; // raw collateral units
    address target;
    bytes4 selector; // allow-listed with target
    bytes payload; // abi-encoded args, no selector
    uint32 actionGasCap;
    uint64 dwellStart; // 0 = not observing
    uint64 expiresAt; // absolute unix deadline; 0 = fall back to market expiry
    bool recurring;
    uint32 cooldownSec;
    uint64 lastExecutedAt;
    TriggerState state;
}

/// @notice User-supplied fields for `createTrigger`. Everything else on `Trigger` is derived
///         (owner, pinnedNonce, dwellStart, lastExecutedAt, state).
struct CreateParams {
    address pool;
    uint16 thresholdBps;
    Direction direction;
    uint32 dwellSec;
    uint16 maxSpreadBps;
    uint128 minDepthPerSide;
    address target;
    bytes4 selector;
    bytes payload;
    uint32 actionGasCap;
    uint64 expiresAt;
    bool recurring;
    uint32 cooldownSec;
}
