# 12 — Testing Strategy

Foundry for contracts, Vitest for the TS port, Playwright for E2E (optional if time is short).

## Unit tests — `ProbabilityLib`

| ID | Test | Assert |
|---|---|---|
| U1 | `toBps` at 6dp and 18dp | `500_000/1e6 → 5000`; `5e17/1e18 → 5000` |
| U2 | VWAP, single level | equals that level's bps |
| U3 | VWAP, multiple levels | notional-weighted, not arithmetic mean |
| U4 | VWAP stops at `minDepthPerSide` | deeper levels excluded |
| U5 | Insufficient depth | returns `notional < target` |
| U6 | Empty book side | `(0, 0)`, no revert, no div-by-zero |
| U7 | Spread computation | `askBps - bidBps` |
| U8 | **Fuzz:** random books | output always in `[0, 10000]`, never reverts |
| U9 | **Fuzz:** one thin level crossed | depth-weighted mid moves < 100 bps |

## Unit tests — registry & state machine

| ID | Test | Assert |
|---|---|---|
| U10 | `createTrigger` pins `marketNonce` | stored nonce == pool nonce |
| U11 | Threshold 0 or 10000 | reverts `InvalidThreshold` |
| U12 | Dwell out of bounds | reverts `InvalidDwell` |
| U13 | Non-allow-listed action | reverts `ActionNotAllowed` |
| U14 | Gas cap > 500k | reverts `GasCapTooHigh` |
| U15 | 17th trigger on a pool | reverts `PoolTriggerLimit` |
| U16 | Cancel by non-owner | reverts `NotOwner` |
| U17 | State mutation by non-handler | reverts `NotHandler` |
| U18 | Full happy path ARMED→OBSERVING→EXECUTED | correct sequence |
| U19 | Dwell reset on disqualification | `dwellStart == 0`, state ARMED |
| U20 | Recurring respects cooldown | second execution blocked inside cooldown |
| U21 | `withdrawSurplus` below 32 ether | reverts (**I9**) |

## Integration tests (forked Shannon or mocked `IBinaryPool`)

| ID | Test | Assert |
|---|---|---|
| I1 | `MockBinaryPool` matches real ABI | selectors identical to `binaryPoolReadAbi` |
| I2 | Snapshot against real book shape | fields populate correctly |
| I3 | Simulated `onEvent` from `0x0100` | evaluation runs |
| I4 | Action dispatch to `DemoVault` | `riskyBalance → safeBalance` |
| I5 | 16 triggers, one callback | **measure total gas < 10,000,000** |

## Adversarial tests — **the ones that matter for judging**

| ID | Attack | Expected |
|---|---|---|
| A1 | **`topic0` verification** — emit a real `OrderFilled` from a mock, hash the log's topic0, compare to the computed constant | Equal. *This is the SDK's documented past failure mode — a wrong arity silently filters on a topic no pool emits* |
| A2 | `onEvent` called from a non-precompile address | reverts `OnlyReactivityPrecompile` (**I1**) |
| A3 | Attacker contract emits fake `OrderFilled` | handler finds no triggers for that emitter, no-ops |
| A4 | Single fill clears one thin level, spiking the touch | gates hold, **no execution** (**I4**) |
| A5 | Probability oscillates across the threshold | dwell resets each time, no execution |
| A6 | Two callbacks in one block on a qualified trigger | exactly one `TriggerExecuted`, one `Derisked` (**I2**) |
| A7 | `marketNonce` incremented mid-dwell (pool recycled) | state → `EXPIRED`, no execution (**I3**) |
| A8 | Target reverts | trigger `FAILED`, other triggers still evaluate (**I7**) |
| A9 | Target consumes unbounded gas | capped at `actionGasCap`, loop continues |
| A10 | Book goes one-sided during dwell | dwell resets |
| A11 | Book thins below `minDepthPerSide` during dwell | dwell resets |
| A12 | Market expires during dwell | `EXPIRED`, no execution |
| A13 | Trigger targeting the registry | rejected at `createTrigger` |
| A14 | Reentrancy from a malicious target | state already written, no double execution |

A1, A4, A6 and A7 are the four to demonstrate on video or in the README. They are the tests that show
the design is real rather than a happy-path prototype.

## TS/Solidity parity

| ID | Test | Assert |
|---|---|---|
| P1 | Shared JSON fixtures of book states | TS `depthWeightedBps` == Solidity, exactly, for all fixtures |
| P2 | Gate evaluation parity | identical pass/fail vectors |

If these diverge, the UI preview lies about whether a trigger will fire. Non-negotiable.

> ✅ **Done (PHASE 6).** `contracts/test/parity/Parity.t.sol` (5) + `web/lib/probability.test.ts`
> (vitest, 6) assert the **same fixture inputs and expected outputs** across the Solidity library
> and its TS port — `toBps` at 6/18 dp, symmetric book, thin-top-over-a-gap (`midBps == 5193` both
> sides), one-sided, below-min-depth, `vwapUntil` truncation. Change either library → one breaks.

## End-to-end (Shannon)

1. Deploy registry, handler, vault. Fund registry ≥32 STT. Allow-list `DemoVault.derisk()`.
2. Faucet TestUSDC; run `ec-maker` to create a two-sided book.
3. Frontend: arm a trigger with a threshold just above current probability, dwell 30s.
4. Cross the market with `placeLimit`; observe `OBSERVING`.
5. Hold 30s; observe execution with no manual transaction.
6. Assert `DemoVault.safeBalance` increased and both block numbers are recorded.
7. Assert the `TriggerExecuted` block equals the `OrderFilled` block (or document next-block).

## Acceptance criteria

- ✅ All U, I, A, P tests pass — **99 tests**, CI profile (10k fuzz) green.
- ✅ I5 measured gas < 10M with headroom — ~597k for 16 triggers (~6% of the limit).
- E2E completes on Shannon **twice consecutively** — flakiness on demo day is the top risk.
- ✅ `forge coverage` ≥ 85% on `ProbabilityLib` and `ThresholdRegistry` — **100% and 99.23%** lines
  respectively; `ThresholdHandler` 97.65%, `DemoVault` 100% (PHASE 9, docs/16).
