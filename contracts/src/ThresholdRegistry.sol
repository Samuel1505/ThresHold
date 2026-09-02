// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    SomniaExtensions
} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import { IBinaryPool } from "./interfaces/IBinaryPool.sol";
import { Trigger, CreateParams, Direction, TriggerState } from "./Types.sol";

/// @title ThresholdRegistry — trigger state, permissions, subscriptions, funding (docs/04, docs/08)
/// @notice Holds all value and permissions. Separated from the handler so the precompile-callable
///         surface (the handler) stays minimal and cannot be bricked. The registry is the
///         subscription owner — `SomniaExtensions.subscribe` checks the *calling contract's*
///         balance against `SUBSCRIPTION_OWNER_MINIMUM_BALANCE` (confirmed PHASE 0.2), so the
///         registry must hold >= 32 STT.
contract ThresholdRegistry {
    // ─────────────────────────────────────────────────────────── constants ──
    uint16 public constant MAX_TRIGGERS_PER_POOL = 16;
    /// @dev Griefing bound on a single action dispatch. Sized for Somnia's ~10x gas schedule —
    ///      a first-time cold SSTORE in an action needs ~1.5M gas *available* on Shannon even
    ///      though it consumes far less (measured PHASE 5). 16 * MAX_ACTION_GAS must stay under
    ///      the subscription `gasLimit` (default below).
    uint32 public constant MAX_ACTION_GAS = 2_000_000;
    uint32 public constant MIN_DWELL_SEC = 5;
    uint32 public constant MAX_DWELL_SEC = 3600;
    uint256 public constant MIN_SUBSCRIPTION_BALANCE = 32 ether;
    address internal constant PRECOMPILE = address(0x0100);

    /// @notice keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)")
    ///         — CONFIRMED against a live Shannon log in PHASE 0.5/0.6 (docs/02 PHASE 0 RESULTS).
    bytes32 public constant ORDER_FILLED_TOPIC0 =
        0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399;

    // ───────────────────────────────────────────────────────────── storage ──
    address public immutable admin; // protocol admin (deployer)
    address public handler; // the only contract that may mutate trigger state
    bool public paused;
    uint256 public nextTriggerId; // ids start at 1; 0 == "none"

    mapping(uint256 => Trigger) internal _triggers;
    mapping(address => uint256[]) internal _triggersByOwner;
    mapping(address => uint256[]) internal _triggersByPool;
    mapping(address => uint256) public poolSubscriptionId; // pool => subId (0 = none)
    mapping(address => mapping(bytes4 => bool)) public allowedAction; // target => selector => ok

    address[] internal _subscribedPools;
    mapping(address => uint256) internal _subscribedPoolIndex; // 1-based; 0 = not present

    // subscription options (owner-tunable via setSubscriptionOptions). `subGasLimit` is sized for
    // Somnia's ~10x gas schedule: the per-callback machinery plus up to 16 * MAX_ACTION_GAS.
    // `MAXIMUM_HANDLER_GAS_LIMIT` is 200M, so there is headroom.
    uint64 public subPriorityFeePerGas = 1 gwei;
    uint64 public subMaxFeePerGas = 20 gwei;
    uint64 public subGasLimit = 50_000_000;

    uint256 private _lock = 1;

    // ────────────────────────────────────────────────────────────── events ──
    event HandlerSet(address indexed handler);
    event TriggerCreated(
        uint256 indexed id, address indexed owner, address indexed pool, uint64 pinnedNonce
    );
    event TriggerCancelled(uint256 indexed id);
    event TriggerStateChanged(uint256 indexed id, TriggerState from, TriggerState to);
    event ExecutionRecorded(uint256 indexed id, uint16 probabilityBps, bool success);
    event SubscriptionCreated(address indexed pool, uint256 subId);
    event SubscriptionRemoved(address indexed pool, uint256 subId);
    event ActionAllowed(address indexed target, bytes4 indexed selector, bool allowed);
    event SubscriptionOptionsSet(uint64 priorityFeePerGas, uint64 maxFeePerGas, uint64 gasLimit);
    event DwellExpiryScheduled(uint256 timestampMillis, uint256 subId);
    event DwellExpiryScheduleFailed(uint256 timestampMillis);
    event Funded(address indexed from, uint256 amount);
    event SurplusWithdrawn(address indexed to, uint256 amount);
    event Paused(bool paused);

    // ────────────────────────────────────────────────────────────── errors ──
    error NotAdmin();
    error NotHandler();
    error NotOwner();
    error HandlerNotSet();
    error HandlerAlreadySet();
    error ContractPaused();
    error InvalidThreshold();
    error InvalidDwell();
    error GasCapTooHigh();
    error ActionNotAllowed();
    error PoolTriggerLimit();
    error MarketNotTradable();
    error TriggerNotFound();
    error NotCancellable();
    error TriggerNotActive();
    error InsufficientSubscriptionBalance();
    error OnlySelf();
    error Reentrancy();

    // ─────────────────────────────────────────────────────────── modifiers ──
    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyHandler() {
        if (msg.sender != handler) revert NotHandler();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor() {
        admin = msg.sender;
    }

    // ─────────────────────────────────────────────────────── admin config ──

    /// @notice Wire the handler once, after both contracts are deployed (deploy step 4, docs/13).
    function setHandler(address _handler) external onlyAdmin {
        if (handler != address(0)) revert HandlerAlreadySet();
        if (_handler == address(0)) revert HandlerNotSet();
        handler = _handler;
        emit HandlerSet(_handler);
    }

    /// @notice Curate the `(target, selector)` action allow-list. Admin only (docs/11).
    function setActionAllowed(address target, bytes4 selector, bool allowed) external onlyAdmin {
        if (
            target == address(this) || target == handler || target == PRECOMPILE
                || target == address(0)
        ) revert ActionNotAllowed();
        allowedAction[target][selector] = allowed;
        emit ActionAllowed(target, selector, allowed);
    }

    function setPaused(bool p) external onlyAdmin {
        paused = p;
        emit Paused(p);
    }

    function setSubscriptionOptions(uint64 priorityFeePerGas, uint64 maxFeePerGas, uint64 gasLimit)
        external
        onlyAdmin
    {
        subPriorityFeePerGas = priorityFeePerGas;
        subMaxFeePerGas = maxFeePerGas;
        subGasLimit = gasLimit;
        emit SubscriptionOptionsSet(priorityFeePerGas, maxFeePerGas, gasLimit);
    }

    /// @notice Withdraw surplus native balance, never dropping below the subscription minimum (I9).
    function withdrawSurplus(uint256 amount) external onlyAdmin {
        if (address(this).balance < amount + MIN_SUBSCRIPTION_BALANCE) {
            revert InsufficientSubscriptionBalance();
        }
        (bool ok,) = admin.call{ value: amount }("");
        if (!ok) revert InsufficientSubscriptionBalance();
        emit SurplusWithdrawn(admin, amount);
    }

    /// @notice Kill every subscription. Admin escape hatch (docs/05 lifecycle).
    function emergencyUnsubscribeAll() external onlyAdmin {
        address[] memory pools = _subscribedPools;
        for (uint256 i; i < pools.length; ++i) {
            _unsubscribe(pools[i]);
        }
    }

    // ───────────────────────────────────────────────────── trigger CRUD ──

    function createTrigger(CreateParams calldata p) external nonReentrant returns (uint256 id) {
        if (handler == address(0)) revert HandlerNotSet();
        if (paused) revert ContractPaused();
        if (p.thresholdBps == 0 || p.thresholdBps >= 10_000) revert InvalidThreshold();
        if (p.dwellSec < MIN_DWELL_SEC || p.dwellSec > MAX_DWELL_SEC) revert InvalidDwell();
        if (p.actionGasCap == 0 || p.actionGasCap > MAX_ACTION_GAS) revert GasCapTooHigh();
        if (p.recurring && p.cooldownSec < p.dwellSec) revert InvalidDwell();
        if (!allowedAction[p.target][p.selector]) revert ActionNotAllowed();
        if (
            p.target == address(this) || p.target == handler || p.target == PRECOMPILE
                || p.target == address(0)
        ) revert ActionNotAllowed();
        if (_triggersByPool[p.pool].length >= MAX_TRIGGERS_PER_POOL) revert PoolTriggerLimit();
        if (IBinaryPool(p.pool).finalized()) revert MarketNotTradable();
        if (IBinaryPool(p.pool).booksEmpty()) revert MarketNotTradable();

        uint64 nonce = IBinaryPool(p.pool).marketNonce(); // PIN — gate G2

        id = ++nextTriggerId;
        _triggers[id] = Trigger({
            owner: msg.sender,
            pool: p.pool,
            pinnedNonce: nonce,
            thresholdBps: p.thresholdBps,
            direction: p.direction,
            dwellSec: p.dwellSec,
            maxSpreadBps: p.maxSpreadBps,
            minDepthPerSide: p.minDepthPerSide,
            target: p.target,
            selector: p.selector,
            payload: p.payload,
            actionGasCap: p.actionGasCap,
            dwellStart: 0,
            expiresAt: p.expiresAt,
            recurring: p.recurring,
            cooldownSec: p.cooldownSec,
            lastExecutedAt: 0,
            state: TriggerState.ARMED
        });
        _triggersByOwner[msg.sender].push(id);
        _triggersByPool[p.pool].push(id);

        if (poolSubscriptionId[p.pool] == 0) _subscribe(p.pool);

        emit TriggerCreated(id, msg.sender, p.pool, nonce);
        emit TriggerStateChanged(id, TriggerState.NONE, TriggerState.ARMED);
    }

    /// @notice Cancel your own trigger. Unsubscribes the pool if this was its last active trigger.
    function cancelTrigger(uint256 id) external nonReentrant {
        Trigger storage t = _triggers[id];
        if (t.owner == address(0)) revert TriggerNotFound();
        if (t.owner != msg.sender) revert NotOwner();
        if (t.state != TriggerState.ARMED && t.state != TriggerState.OBSERVING) {
            revert NotCancellable();
        }
        _setState(id, TriggerState.CANCELLED);
        emit TriggerCancelled(id);
        if (!_hasActiveTrigger(t.pool)) _unsubscribe(t.pool);
    }

    /// @notice Permissionless cleanup: drop a pool's subscription once nothing active watches it.
    ///         Keeps the design keeper-free — anyone may call, correctness never depends on it.
    function pruneSubscription(address pool) external nonReentrant {
        if (poolSubscriptionId[pool] != 0 && !_hasActiveTrigger(pool)) _unsubscribe(pool);
    }

    // ──────────────────────────────────────────────── handler-only mutators ──

    /// @notice The handler's single state-write entry point. `dwellStart` is set verbatim
    ///         (block.timestamp when entering OBSERVING, 0 otherwise).
    function applyEvaluation(uint256 id, TriggerState newState, uint64 dwellStart)
        external
        onlyHandler
        nonReentrant
    {
        Trigger storage t = _triggers[id];
        TriggerState cur = t.state;
        if (cur == TriggerState.NONE || cur == TriggerState.CANCELLED) revert TriggerNotActive();
        t.dwellStart = dwellStart;
        if (newState != cur) _setState(id, newState);
    }

    /// @notice Records an execution's outcome. `lastExecutedAt` feeds the recurring cooldown.
    function recordExecution(uint256 id, uint16 probabilityBps, bool success, uint64 executedAt)
        external
        onlyHandler
        nonReentrant
    {
        _triggers[id].lastExecutedAt = executedAt;
        emit ExecutionRecorded(id, probabilityBps, success);
    }

    /// @notice Schedule a one-shot precompile tick to the handler at `timestampMillis` so a
    ///         trigger's dwell is evaluated at least once at dwell end even in a silent book
    ///         (docs/07 §6). The registry is the funded subscriber, so the schedule call must
    ///         originate here. Best-effort: a scheduling failure (`TimestampInPast`,
    ///         `InsufficientBalance`) never bricks the callback that requested it — Threshold
    ///         degrades to fill-driven, the documented FALLBACK (docs/05).
    function scheduleDwellExpiry(uint256 timestampMillis) external onlyHandler {
        try this.scheduleDwellExpirySelf(timestampMillis) returns (uint256 subId) {
            emit DwellExpiryScheduled(timestampMillis, subId);
        } catch {
            emit DwellExpiryScheduleFailed(timestampMillis);
        }
    }

    /// @dev `onlySelf` wrapper so the inlined `SomniaExtensions` call can be `try`/`catch`-ed.
    function scheduleDwellExpirySelf(uint256 timestampMillis) external returns (uint256) {
        if (msg.sender != address(this)) revert OnlySelf();
        SomniaExtensions.SubscriptionOptions memory opts = SomniaExtensions.SubscriptionOptions({
            priorityFeePerGas: subPriorityFeePerGas,
            maxFeePerGas: subMaxFeePerGas,
            gasLimit: subGasLimit
        });
        return SomniaExtensions.scheduleSubscriptionAtTimestamp(handler, timestampMillis, opts);
    }

    // ─────────────────────────────────────────────────────────────── views ──

    function get(uint256 id) external view returns (Trigger memory) {
        return _triggers[id];
    }

    function triggersByPool(address pool) external view returns (uint256[] memory) {
        return _triggersByPool[pool];
    }

    function triggersByOwner(address owner) external view returns (uint256[] memory) {
        return _triggersByOwner[owner];
    }

    function getSubscribedPools() external view returns (address[] memory) {
        return _subscribedPools;
    }

    // ───────────────────────────────────────────────────────────── internal ──

    function _setState(uint256 id, TriggerState s) internal {
        emit TriggerStateChanged(id, _triggers[id].state, s);
        _triggers[id].state = s;
    }

    function _hasActiveTrigger(address pool) internal view returns (bool) {
        uint256[] storage ids = _triggersByPool[pool];
        for (uint256 i; i < ids.length; ++i) {
            TriggerState s = _triggers[ids[i]].state;
            if (s == TriggerState.ARMED || s == TriggerState.OBSERVING) return true;
        }
        return false;
    }

    function _subscribe(address pool) internal {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [ORDER_FILLED_TOPIC0, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: pool
        });
        SomniaExtensions.SubscriptionOptions memory opts = SomniaExtensions.SubscriptionOptions({
            priorityFeePerGas: subPriorityFeePerGas,
            maxFeePerGas: subMaxFeePerGas,
            gasLimit: subGasLimit
        });
        uint256 subId = SomniaExtensions.subscribe(handler, filter, opts);
        poolSubscriptionId[pool] = subId;
        _subscribedPools.push(pool);
        _subscribedPoolIndex[pool] = _subscribedPools.length; // 1-based
        emit SubscriptionCreated(pool, subId);
    }

    function _unsubscribe(address pool) internal {
        uint256 subId = poolSubscriptionId[pool];
        if (subId == 0) return;
        delete poolSubscriptionId[pool];

        uint256 idx = _subscribedPoolIndex[pool]; // 1-based
        if (idx != 0) {
            uint256 last = _subscribedPools.length;
            if (idx != last) {
                address moved = _subscribedPools[last - 1];
                _subscribedPools[idx - 1] = moved;
                _subscribedPoolIndex[moved] = idx;
            }
            _subscribedPools.pop();
            delete _subscribedPoolIndex[pool];
        }

        SomniaExtensions.unsubscribe(subId);
        emit SubscriptionRemoved(pool, subId);
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }
}
