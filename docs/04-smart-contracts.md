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

markState(uint256 id, TriggerState s)          // onlyHandler
recordExecution(uint256 id, uint16 pBps, bool ok)  // onlyHandler

setActionAllowed(address target, bytes4 sel, bool ok)   // onlyOwner (protocol admin)
setPaused(bool)                                          // onlyOwner
receive() external payable { emit Funded(msg.sender, msg.value); }
withdrawSurplus(uint256 amt)                             // onlyOwner, must leave >= 32 ether
emergencyUnsubscribeAll()                                // onlyOwner
```

**Access control.** `owner` = deployer (protocol admin) controls the action allow-list, pause and
funding. Trigger owners control only their own triggers. The handler alone may mutate trigger state.

---

## ThresholdHandler

**Purpose.** The only contract the precompile calls. Deliberately minimal.

```solidity
contract ThresholdHandler is SomniaEventHandler {
    ThresholdRegistry public immutable registry;

    function _onEvent(address emitter, bytes32[] calldata topics, bytes calldata data)
        internal override
    {
        uint256[] memory ids = registry.triggersByPool(emitter);
        if (ids.length == 0) return;                 // not our pool — silent

        // Read pool state ONCE, share across all triggers on this pool
        PoolSnapshot memory snap = ProbabilityLib.snapshot(IBinaryPool(emitter), MAX_LEVELS);

        for (uint i; i < ids.length; ++i) {
            _evaluate(ids[i], snap);                 // never reverts; try/catch inside
        }
    }
}
```

```
_evaluate(uint256 id, PoolSnapshot memory snap)
  t = registry.get(id)
  if t.state != ARMED && t.state != OBSERVING: return
  if t.pinnedNonce != snap.marketNonce:  registry.markState(id, EXPIRED); return   // G2
  if snap.finalized || snap.expired || snap.booksEmpty || !snap.twoSided: _resetDwell(t); return
  if snap.spreadBps > t.maxSpreadBps: _resetDwell(t); return                        // G7
  if snap.bidNotional < t.minDepthPerSide || snap.askNotional < t.minDepthPerSide:
      _resetDwell(t); return                                                        // G8

  p = ProbabilityLib.depthWeightedBps(snap)
  q = (t.direction == ABOVE) ? (p >= t.thresholdBps) : (p <= t.thresholdBps)

  if !q: _resetDwell(t); return
  if t.state == ARMED:
      t.dwellStart = now; registry.markState(id, OBSERVING)
      _scheduleDwellExpiry(id, now + t.dwellSec)
      return
  if now - t.dwellStart < t.dwellSec: return
  if t.recurring && now < t.lastExecutedAt + t.cooldownSec: return

  _execute(id, t, p)

_execute(uint256 id, Trigger memory t, uint16 p)
  // EFFECTS BEFORE INTERACTION
  registry.markState(id, t.recurring ? ARMED : EXECUTED)
  registry.recordExecution(id, p, /*pending*/ false)
  bytes memory cd = abi.encodePacked(t.selector, t.payload)
  (bool ok, ) = t.target.call{ gas: t.actionGasCap }(cd)
  registry.recordExecution(id, p, ok)
  if (!ok && !t.recurring) registry.markState(id, FAILED)
  emit TriggerExecuted(id, p, ok)
```

**Critical:** state is written **before** the external call. A malicious target that re-enters
`onEvent` (it cannot — only `0x0100` may call it) or re-enters the registry finds the trigger already
marked. Combined with a `nonReentrant` guard on the registry's handler-only mutators, double
execution is impossible.

---

## ProbabilityLib

Pure/view library. See `07` for the algorithms. Exposes:

```solidity
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
    uint16  bidVwapBps;
    uint16  askVwapBps;
    uint128 bidNotional;
    uint128 askNotional;
}

function snapshot(IBinaryPool pool, uint64 maxLevels) internal view returns (PoolSnapshot memory);
function depthWeightedBps(PoolSnapshot memory s) internal pure returns (uint16);
function toBps(uint256 priceRaw, uint256 oneCollateral) internal pure returns (uint16);
```

Keeping this a library with a pure entry point is what makes the fuzz tests in `12` possible.

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
