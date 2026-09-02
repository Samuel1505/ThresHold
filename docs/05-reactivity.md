# 05 — Somnia Reactivity Integration

## Package

```bash
npm install @somnia-chain/reactivity-contracts@0.2.1   # Solidity
npm install @somnia-chain/reactivity@0.2.1             # TS SDK (optional)
```
Forge: `forge install` the repo. **Pragma is `solidity 0.8.30`** — match it project-wide.

## EVENT VERIFICATION — resolved `CONFIRMED`

The event Threshold subscribes to is **`OrderFilled`, emitted by the DreamDEX BinaryPool.**

`@somnia-chain/markets-sdk/dist/eventsAbi.d.ts` L1–2 states `orderBookEventsAbi` are
*"Order lifecycle events shared by SpotPool + BinaryPool (the OrderBook base)."*

```solidity
event OrderFilled(
    uint128 indexed takerOrderId,
    uint128 indexed makerOrderId,
    uint256 quantityFilled,
    uint256 takerRemainingQuantity,
    uint256 makerRemainingQuantity,
    uint256 fillPrice
);
```

```
topic0 = keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)")
```

- `takerOrderId`, `makerOrderId` → `eventTopics[1]`, `eventTopics[2]`
- `quantityFilled`, `takerRemainingQuantity`, `makerRemainingQuantity`, `fillPrice` → ABI-encoded in `data`

**Threshold does not use `fillPrice` as the signal.** The fill is only a *wake-up*; the signal is
re-derived from the book via on-chain reads (see `07`). Using `fillPrice` directly would be trivially
manipulable by a single wash trade — this distinction is the core of the manipulation resistance.

> ⚠️ **Do not use `MarkPriceUpdated`.** It is in `spotPoolEventsAbi` and is **SpotPool-only**. Binary
> pools do not emit it.
>
> ⚠️ **Verify `topic0` against a real log before trusting it.** The SDK carries a comment documenting a
> past incident where a wrong ABI arity produced a different `topic0`, so `watchEvent` filtered on
> something no pool ever emitted and the tail silently never fired. Reproduce the hash from an actual
> emitted log in PHASE 0.

## Subscription configuration

```solidity
SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
    eventTopics: [
        ORDER_FILLED_TOPIC0,   // keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)")
        bytes32(0),            // wildcard: any takerOrderId
        bytes32(0),            // wildcard: any makerOrderId
        bytes32(0)
    ],
    origin:  address(0),       // any tx origin
    emitter: binaryPoolAddress // THE specific pool for this market
});

SomniaExtensions.SubscriptionOptions memory opts = SomniaExtensions.SubscriptionOptions({
    priorityFeePerGas: 1 gwei,
    maxFeePerGas:      20 gwei,   // >= priorityFee + MINIMUM_BASE_FEE_PER_GAS (6 gwei)
    gasLimit:          10_000_000 // default; max 200_000_000
});

uint256 subId = SomniaExtensions.subscribe(address(handler), filter, opts);
```

**One subscription per pool, not per trigger.** Many triggers can watch the same market; the handler
iterates that pool's trigger set. Subscribing per-trigger would multiply cost for no benefit and hit
the funding constraint faster.

## Constants — `CONFIRMED` from `SomniaExtensions`

| Constant | Value |
|---|---|
| `SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS` | `address(0x0100)` |
| `SUBSCRIPTION_OWNER_MINIMUM_BALANCE` | `32 ether` |
| `MINIMUM_BASE_FEE_PER_GAS` | `6 gwei` |
| `MAXIMUM_HANDLER_GAS_LIMIT` | `200_000_000` |
| `DEFAULT_HANDLER_GAS_LIMIT` | `10_000_000` |
| `DEFAULT_MAX_FEE_PER_GAS` | `20 gwei` |
| `DEFAULT_PRIORITY_FEE_PER_GAS` | `0` |

Errors: `HandlerZeroAddress`, `EmptyFilter`, `GasLimitZero`, `GasLimitExceeded`,
`InvalidMaxFeePerGas`, `InsufficientBalance`, `TimestampInPast`, `BlockInPast`, `UnsubscribeFailed`.

## Handler contract

```solidity
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";

contract ThresholdHandler is SomniaEventHandler {
    function _onEvent(
        address emitter,            // the BinaryPool that emitted
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        // 1. Is `emitter` a pool we have triggers for? If not, return silently.
        // 2. Distinguish OrderFilled (eventTopics[0]) from a scheduled tick.
        // 3. For each trigger on this pool: evaluate (docs/07), advance state (docs/08).
        // 4. Execute any that reached QUALIFIED.
        // NEVER revert on a per-trigger failure — isolate with try/catch (see docs/11).
    }
}
```

`SomniaEventHandler` already enforces `msg.sender == address(0x0100)` and reverts
`OnlyReactivityPrecompile()` otherwise, and implements ERC-165 `supportsInterface` so the precompile
can verify handler compatibility. **Do not override or weaken either.**

## Subscription lifecycle

| Phase | Action |
|---|---|
| Deploy | Deploy `ThresholdHandler`. Fund the **subscriber contract** with ≥32 STT. |
| First trigger on a pool | `subscribe()` with `emitter = pool`; store `poolSubscriptionId[pool]` |
| Subsequent triggers, same pool | Reuse the existing subscription |
| Dwell entered | `scheduleSubscriptionAtTimestamp(handler, (dwellStart+dwellSec)*1000, opts)` — one-shot |
| Last trigger on a pool cancelled | `unsubscribe(poolSubscriptionId[pool])`, clear mapping |
| Emergency | Owner-only `emergencyUnsubscribeAll()` |

**Funding:** the subscription owner pays gas per handled event. The subscriber contract must stay
above `SUBSCRIPTION_OWNER_MINIMUM_BALANCE` **and** hold enough balance to pay callbacks. Expose a
`payable receive()` and surface the balance prominently in the UI — a silently drained subscription
looks identical to a broken product, and will look that way on demo day.

## Failure handling

| Failure | Behaviour |
|---|---|
| Handler reverts | The callback fails. **Reverted writes do not throw on this stack** — instrument with events, never assume success |
| One trigger's action reverts | `try/catch` isolates it; mark that trigger `FAILED`, continue the loop |
| Callback exceeds gas limit | Bound the per-pool trigger loop (`MAX_TRIGGERS_PER_POOL = 16`) and cap action gas |
| Subscription underfunded | Callbacks stop. UI must show a funding warning |
| Pool recycled | Gate G2 (`marketNonce`) rejects; trigger is marked `EXPIRED` |

## Implementation tiers

### Preferred — `CONFIRMED`, build this
Reactivity subscription on `OrderFilled` (emitter = pool) + `scheduleSubscriptionAtTimestamp` for
dwell expiry. Fully keeper-free. Signal re-derived on-chain from the book.

### Fallback — if `scheduleSubscriptionAtTimestamp` fails
Fill-driven only. Trigger executes on the first fill *after* dwell elapses. Still keeper-free; loses
the guarantee of evaluation in a quiet book. Document the limitation in the README.

### Last resort — only if BLOCKER-1 (32 STT) is unresolvable
An off-chain watcher calls a permissionless `poke(triggerId)` on the registry. **All validation stays
on-chain and unchanged** — the watcher cannot cause an invalid execution, only prompt evaluation.
The security model survives; the "no keeper" claim does not.

**If you ship this tier, say so plainly in the README and the demo.** A judge who discovers a hidden
keeper will discard the entire submission. A judge told openly that the keeper is a testnet funding
workaround, with the on-chain path implemented and gated, will not.
