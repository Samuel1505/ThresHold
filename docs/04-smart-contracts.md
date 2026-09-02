# 04 — Smart Contracts

Solidity `0.8.30` (matches `@somnia-chain/reactivity-contracts`). Foundry.

## Shared types

```solidity
enum Direction   { ABOVE, BELOW }
enum TriggerState { NONE, ARMED, OBSERVING, EXECUTED, EXPIRED, CANCELLED, FAILED }

struct Trigger {
    address  owner;
    address  pool;              // BinaryPool address
    uint64   pinnedNonce;       // marketNonce() at arm time — GATE G2
    uint16   thresholdBps;      // 0..10000
    Direction direction;
    uint32   dwellSec;
    uint16   maxSpreadBps;
    uint128  minDepthPerSide;   // raw collateral units
    address  target;
    bytes4   selector;          // allow-listed with target
    bytes    payload;           // abi-encoded args, no selector
    uint32   actionGasCap;
    uint64   dwellStart;        // 0 = not observing
    uint64   expiresAt;         // absolute deadline; 0 = market expiry
    bool     recurring;
    uint32   cooldownSec;
    uint64   lastExecutedAt;
    TriggerState state;
}
```

> Improvements over the naive struct: `pinnedNonce` (prevents firing on a recycled pool),
> `maxSpreadBps` + `minDepthPerSide` (manipulation resistance is per-trigger, not global),
> `selector` separate from `payload` (allow-listing is on `(target, selector)`, so a user cannot
> smuggle a different function), `actionGasCap` (griefing bound), `expiresAt` (no immortal triggers).

---

## ThresholdRegistry

**Purpose.** Owns trigger state, permissions, subscriptions, and native balance.

### Storage
```solidity
mapping(uint256 => Trigger)              triggers;
mapping(address => uint256[])            triggersByOwner;
mapping(address => uint256[])            triggersByPool;
mapping(address => uint256)              poolSubscriptionId;   // pool => subId (0 = none)
mapping(address => mapping(bytes4=>bool)) allowedAction;       // target => selector => ok
uint256                                  nextTriggerId;
address                                  handler;
bool                                     paused;
uint16 constant MAX_TRIGGERS_PER_POOL = 16;
uint32 constant MAX_ACTION_GAS        = 500_000;
uint32 constant MIN_DWELL_SEC         = 5;
uint32 constant MAX_DWELL_SEC         = 3600;
```

### Events
`TriggerCreated`, `TriggerCancelled`, `TriggerStateChanged(id, from, to)`,
`TriggerExecuted(id, probabilityBps, success, returndataHash)`,
`SubscriptionCreated(pool, subId)`, `SubscriptionRemoved(pool, subId)`,
`ActionAllowed(target, selector, bool)`, `Funded(sender, amount)`, `Paused(bool)`.

### Custom errors
`NotOwner`, `NotHandler`, `TriggerNotFound`, `InvalidThreshold`, `InvalidDwell`,
`ActionNotAllowed`, `PoolTriggerLimit`, `AlreadyExecuted`, `ContractPaused`,
`InsufficientSubscriptionBalance`, `GasCapTooHigh`, `MarketNotTradable`.

### Functions

```
createTrigger(CreateParams p) returns (uint256 id)
  require !paused
  require p.thresholdBps > 0 && < 10000                    -> InvalidThreshold
  require MIN_DWELL_SEC <= p.dwellSec <= MAX_DWELL_SEC     -> InvalidDwell
  require p.actionGasCap <= MAX_ACTION_GAS                 -> GasCapTooHigh
  require allowedAction[p.target][p.selector]              -> ActionNotAllowed
  require triggersByPool[p.pool].length < MAX_TRIGGERS_PER_POOL
  require !IBinaryPool(p.pool).finalized()                 -> MarketNotTradable
  require !IBinaryPool(p.pool).booksEmpty()
  nonce = IBinaryPool(p.pool).marketNonce()                // PIN
  store Trigger{ owner: msg.sender, pinnedNonce: nonce, state: ARMED, ... }
  if poolSubscriptionId[p.pool] == 0: _subscribe(p.pool)
  emit TriggerCreated

cancelTrigger(uint256 id)
  require triggers[id].owner == msg.sender                 -> NotOwner
  state = CANCELLED
  if no remaining active triggers on that pool: _unsubscribe(pool)

applyEvaluation(uint256 id, TriggerState s, uint64 dwellStart)   // onlyHandler, nonReentrant
recordExecution(uint256 id, uint16 pBps, bool ok, uint64 executedAt)  // onlyHandler, nonReentrant
scheduleDwellExpiry(uint256 timestampMillis)   // onlyHandler — best-effort, try/catch internally

setActionAllowed(address target, bytes4 sel, bool ok)   // onlyAdmin (protocol admin)
setPaused(bool)                                          // onlyAdmin
setSubscriptionOptions(uint64 prio, uint64 maxFee, uint64 gasLimit)  // onlyAdmin
receive() external payable { emit Funded(msg.sender, msg.value); }
withdrawSurplus(uint256 amt)                             // onlyAdmin, must leave >= 32 ether (I9)
emergencyUnsubscribeAll()                                // onlyAdmin
pruneSubscription(address pool)                          // permissionless: drop a dead subscription
```

> **PHASE 2 note.** The single handler write path is `applyEvaluation(id, newState, dwellStart)` —
> it sets `dwellStart` verbatim (block.timestamp on entering OBSERVING, 0 otherwise) and emits
> `TriggerStateChanged` on a real transition. `recordExecution` stores `lastExecutedAt` (recurring
> cooldown) and emits `ExecutionRecorded`. The handler emits `TriggerExecuted(id, pBps, ok,
> returndataHash)` itself — that is the event the frontend watches (docs/03).

**Access control.** `admin` = deployer (protocol admin) controls the action allow-list, pause and
funding. Trigger owners control only their own triggers. The handler alone may mutate trigger state.

---

## ThresholdHandler

**Purpose.** The only contract the precompile calls. Deliberately minimal.

```solidity
contract ThresholdHandler is SomniaEventHandler {
    ThresholdRegistry public immutable registry;

    function _onEvent(address emitter, bytes32[] calldata topics, bytes calldata /*data*/)
        internal override
    {
        emit CallbackEntered(emitter, topics.length != 0 ? topics[0] : bytes32(0), ...);
        if (emitter == PRECOMPILE) { _onScheduledTick(); return; }   // PHASE 4 dwell-expiry tick

        uint256[] memory ids = registry.triggersByPool(emitter);
        if (ids.length == 0) return;                 // not our pool — silent

        // Read the book ONCE, share across all triggers on this pool
        PoolSnapshot memory snap = ProbabilityLib.snapshot(IBinaryPool(emitter), MAX_LEVELS);

        for (uint i; i < ids.length; ++i) {
            try this.evaluateExternal(ids[i], snap) {}          // onlySelf; own call frame per trigger
            catch { emit TriggerEvaluationFailed(ids[i]); }     // one bad trigger can't block 15 (I7)
        }
    }
}
```

An event is emitted on **every** callback entry before any logic (`CallbackEntered`), plus
`GateFailed` / `TriggerExpired` / `DwellStarted` / `DwellReset` along the way — a silent callback
failure is otherwise undiagnosable (docs/18).

```
_evaluate(uint256 id, PoolSnapshot memory snap)                       // via this.evaluateExternal (onlySelf)
  t = registry.get(id)
  if t.state != ARMED && t.state != OBSERVING: return                                       // G1
  if t.pinnedNonce != snap.marketNonce: registry.applyEvaluation(id, EXPIRED, 0); return    // G2
  if snap.finalized || snap.expired || (t.expiresAt != 0 && now >= t.expiresAt):
      registry.applyEvaluation(id, EXPIRED, 0); return                                       // G3/G4
  if snap.booksEmpty || !snap.twoSided: _disqualify(id, t); return                          // G5/G6
  if snap.spreadBps > t.maxSpreadBps: _disqualify(id, t); return                             // G7

  (p, bidDeep, askDeep) = ProbabilityLib.depthWeightedBps(snap, t.minDepthPerSide)          // G8 + signal
  if !bidDeep || !askDeep: _disqualify(id, t); return
  if !ProbabilityLib.qualifies(p, t.thresholdBps, t.direction): _disqualify(id, t); return

  if t.state == ARMED:
      registry.applyEvaluation(id, OBSERVING, uint64(now))
      return now + t.dwellSec        // caller schedules ONE expiry tick per callback (latest end)
  if now - t.dwellStart < t.dwellSec: return
  if t.recurring && t.lastExecutedAt != 0 && now < t.lastExecutedAt + t.cooldownSec: return

  _execute(id, t, p)

_disqualify(id, t)   // reset the dwell, never accumulate across gaps (docs/08)
  if t.state == OBSERVING: registry.applyEvaluation(id, ARMED, 0)

_execute(uint256 id, Trigger memory t, uint16 p)
  // EFFECTS BEFORE INTERACTION
  registry.applyEvaluation(id, t.recurring ? ARMED : EXECUTED, 0)
  bytes memory cd = bytes.concat(t.selector, t.payload)
  (bool ok, bytes memory ret) = t.target.call{ gas: t.actionGasCap }(cd)
  registry.recordExecution(id, p, ok, uint64(now))
  if (!ok && !t.recurring) registry.applyEvaluation(id, FAILED, 0)
  emit TriggerExecuted(id, p, ok, keccak256(ret))
```

> **G8 folds into the signal.** Because `minDepthPerSide` is per-trigger, `depthWeightedBps` takes it
> and returns `(midBps, bidDeep, askDeep)` — one walk of the captured levels computes both the VWAP
> (over the levels consumed reaching min-depth) and whether that depth was met.

**Critical:** state is written **before** the external call. A malicious target that re-enters
`onEvent` (it cannot — only `0x0100` may call it) or re-enters the registry finds the trigger already
marked. Combined with a `nonReentrant` guard on the registry's handler-only mutators, double
execution is impossible.

---

## ProbabilityLib

Pure/view library. See `07` for the algorithms. Exposes:

```solidity
struct Level { uint16 priceBps; uint128 notional; }   // notional = price * qty / oneCollateral

struct PoolSnapshot {
    uint64  marketNonce;
    bool    finalized;
    bool    expired;
    bool    booksEmpty;
    bool    twoSided;
    uint256 oneCollateral;
    uint16  bestBidBps;
    uint16  bestAskBps;
    uint16  spreadBps;
    Level[] bids;          // best-first, capped at maxLevels — carried so depthWeightedBps
    Level[] asks;          // can walk them per-trigger (minDepthPerSide is per-trigger)
}

function snapshot(IBinaryPool pool, uint64 maxLevels) internal view returns (PoolSnapshot memory);
function depthWeightedBps(PoolSnapshot memory s, uint128 minDepthPerSide)
    internal pure returns (uint16 midBps, bool bidDeep, bool askDeep);
function vwapUntil(Level[] memory levels, uint128 target)
    internal pure returns (uint16 vwapBps, uint128 consumed);
function qualifies(uint16 p, uint16 thresholdBps, Direction direction) internal pure returns (bool);
function toBps(uint256 priceRaw, uint256 oneCollateral) internal pure returns (uint16);
```

> **Deviation from the earlier struct (docs/07 §3.2 resolution).** The snapshot carries the book
> `Level[]` rather than pre-baked `bidVwapBps`/`bidNotional`, because the VWAP truncation point is
> `minDepthPerSide`, which is per-trigger, not shared. The snapshot is still read ONCE per callback
> and shared; only the cheap final walk is per-trigger. `toBps` clamps a price above `oneCollateral`
> to 10000 rather than wrapping. All functions saturate rather than revert on a hostile pool.

Keeping this a library with pure entry points is what makes the fuzz tests in `12` (U8/U9, 10k runs)
and the TS parity port (P1/P2) possible.

---

## DemoVault

```solidity
contract DemoVault {
    address public immutable handler;
    uint256 public riskyBalance;
    uint256 public safeBalance;

    function deposit() external payable;                    // anyone
    function derisk() external;                             // only handler; moves risky -> safe
    function reset() external;                              // only owner; for demo re-runs
    event Derisked(uint256 amount, uint256 blockNumber);
}
```

`reset()` matters more than it looks — you will re-record the demo many times.

## Security assumptions

1. The precompile at `0x0100` is honest and only invokes handlers for matching subscriptions.
2. `SomniaEventHandler` correctly restricts `onEvent` to the precompile.
3. BinaryPool view functions are honest.
4. The action allow-list is curated by the protocol admin; arbitrary-target mode is **admin-gated**,
   not user-open. See `11`.
