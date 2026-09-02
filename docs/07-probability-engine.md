# 07 — Probability Engine

The correctness of Threshold lives here. Everything else is plumbing.

## 1. The base formula — `CONFIRMED`

DreamDEX binary pools maintain **one book, quoted in YES terms, whichever leg you trade.**

Evidence — `packages/ec-core/src/orders.ts` L114–116:

```ts
// The book is quoted in YES terms whichever leg you are on: a NO order's price
// is `one - priceOwn`.
const priceYes = outcome === "YES" ? priceOwn : one - priceOwn;
```

Therefore, with `oneCollateral` from `getBinaryPoolParams()`:

```
P(YES) = yesPrice / oneCollateral
```

Both are raw integers in collateral units. `oneCollateral` is `1e6` on Shannon (TestUSDC, 6 dp) and
`1e18` on mainnet — **never hardcode it, always read it from the pool.** This is the same
decimals trap that produces the 18-dp price bug.

All probabilities in Threshold are stored as **basis points of `oneCollateral`**, i.e. `uint16` in
`[0, 10000]`. Fixed-point, no floats, no rounding ambiguity in Solidity.

```solidity
function _toBps(uint256 priceRaw, uint256 oneCollateral) internal pure returns (uint16) {
    return uint16((priceRaw * 10_000) / oneCollateral);
}
```

## 2. Signal sources — `CONFIRMED`

| Source | Signature | Use |
|---|---|---|
| Top of book | `closingTop(uint256 maxSteps) view returns (uint256 bestBid, uint256 bestAsk, bool bidFound, bool askFound)` | Fast mid + spread |
| Depth | `getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])` | Depth-weighted mid, liquidity gate |
| Scale | `getBinaryPoolParams()` → `oneCollateral` | Denominator |
| Liveness | `booksEmpty()`, `finalized()`, `marketExpiryNs()`, `marketNonce()` | Validity gates |

`closingTop` is documented as *"the dual-regime raw top (pre-expiry: best live…)"* — pre-expiry it
returns the live top of book. `NEEDS VERIFICATION` on a live pool; `getBookLevels(isBid, 1)` is the
`FALLBACK` and returns the same information at slightly higher gas.

## 3. Probability variants

Compute in this order. Each is cheap; the whole chain must fit in the callback gas budget.

### 3.1 Mid probability
```
bestBidBps = toBps(bestBid)
bestAskBps = toBps(bestAsk)
midBps     = (bestBidBps + bestAskBps) / 2
spreadBps  = bestAskBps - bestBidBps
```
If `!bidFound || !askFound` → **one-sided book → INVALID.** A one-sided book has no meaningful mid.
This alone rejects most manipulation attempts.

### 3.2 Depth-weighted probability (the signal Threshold actually uses)

Walk both sides accumulating notional until each side reaches `minDepthPerSide`, then take the
notional-weighted average price of the consumed levels on each side and average the two.

```
function depthWeightedBps(pool, oneCollateral, minDepthPerSide, maxLevels):
    bids = pool.getBookLevels(true,  maxLevels)
    asks = pool.getBookLevels(false, maxLevels)

    (bidVwapBps, bidNotional) = vwapUntil(bids, minDepthPerSide, oneCollateral)
    (askVwapBps, askNotional) = vwapUntil(asks, minDepthPerSide, oneCollateral)

    if bidNotional < minDepthPerSide  -> INVALID (thin bid)
    if askNotional < minDepthPerSide  -> INVALID (thin ask)

    return (bidVwapBps + askVwapBps) / 2

function vwapUntil(levels, target, one):
    acc = 0; notional = 0
    for (price, qty) in levels:
        n = price * qty / one          // notional in collateral units
        acc += toBps(price) * n
        notional += n
        if notional >= target: break
    if notional == 0: return (0, 0)
    return (acc / notional, notional)
```

**Why this is the manipulation guard.** A single aggressive fill against a stale quote moves the
*last trade price* and can momentarily move the *touch*. It does not move the depth-weighted mid,
because clearing one thin level leaves the remaining levels dominating the average — and if it
clears enough levels that the average does move, the attacker has paid real size to do it, which is
the definition of a legitimate price move.

`maxLevels` = **8** for the MVP. Enough to be meaningful, bounded for gas.

### 3.3 Confidence score (display only, never gates execution)
```
confidenceBps = 10000
  - min(spreadBps * 20, 5000)                                  // spread penalty
  - min((stalenessSec * 10000) / maxStalenessSec, 3000)        // age penalty
```
Shown in the UI as a 0–100 bar. **Never used in the on-chain decision** — a scalar that silently
blends independent failure modes is worse than explicit gates.

## 4. Validity gates — ALL must pass

Evaluated on-chain inside the callback, in this order (cheapest and most likely to reject first):

| # | Gate | Read | Reject when |
|---|---|---|---|
| G1 | Trigger armed | storage | `state != ARMED && state != OBSERVING` |
| G2 | Market identity | `marketNonce()` | `!= trigger.pinnedNonce` — **the pool was recycled onto a different market** |
| G3 | Not finalized | `finalized()` | `true` |
| G4 | Not expired | `marketExpiryNs()` | `block.timestamp * 1e9 >= marketExpiryNs` |
| G5 | Book present | `booksEmpty()` | `true` |
| G6 | Two-sided | `closingTop` | `!bidFound \|\| !askFound` |
| G7 | Spread | computed | `spreadBps > trigger.maxSpreadBps` |
| G8 | Depth | `getBookLevels` | either side below `trigger.minDepthPerSide` |

Only if G1–G8 pass is `depthWeightedBps` compared against the threshold.

**G2 is the gate nobody else will have.** BinaryPools are recycled onto new markets
(`PoolRecycled` re-points the pool at a fresh market with an incremented nonce). A subscription is
bound to a *pool address*, which outlives the market. Without pinning `marketNonce` at arm time, a
trigger armed on the 14:00 BTC window would silently fire on the 14:05 window's book. Verified in
`readsAbi.js` L41 and `binaryPoolEventsAbi`.

## 5. Dwell / persistence

```
qualified(p) := (direction == ABOVE && p >= thresholdBps)
             || (direction == BELOW && p <= thresholdBps)
```

State transitions on each callback:

| Current | `qualified` | Action |
|---|---|---|
| ARMED | false | no-op |
| ARMED | true | `dwellStart = block.timestamp`; → OBSERVING; **arm dwell-expiry schedule (§6)** |
| OBSERVING | false | `dwellStart = 0`; → ARMED (dwell reset) |
| OBSERVING | true, `now - dwellStart < dwellSec` | no-op, keep observing |
| OBSERVING | true, `now - dwellStart >= dwellSec` | → QUALIFIED → execute |

Any of G2–G8 failing while OBSERVING is treated as `qualified = false` and **resets the dwell.**
A trigger must not survive on a book that went thin.

## 6. The dwell-expiry problem — and its solution

**The flaw in the naive design:** the callback only fires on `OrderFilled`. If probability crosses
0.70 and then the book goes quiet, no further fill occurs, no callback fires, and the trigger never
executes even though the condition held for the entire dwell period. The trigger is silently dead.

**Solution — `CONFIRMED` API.** `SomniaExtensions.scheduleSubscriptionAtTimestamp(handler,
timestampMillis, options)` creates a one-shot time-based subscription.

When a trigger enters OBSERVING, the handler schedules a second subscription at
`(dwellStart + dwellSec) * 1000` ms. That callback re-runs G1–G8 and the dwell check. Fills during
the window can qualify it earlier; the schedule guarantees it is evaluated at least once at dwell
expiry regardless of market activity.

The scheduled callback must be idempotent — see `08` execution-once invariant.

`FALLBACK` if `scheduleSubscriptionAtTimestamp` misbehaves: accept "executes on the first fill after
dwell elapses". Document the limitation. Do not silently ship the broken version.

## 7. Gas budget

Default handler gas limit is `10_000_000` (max `200_000_000`). Per callback:

| Op | Est. gas |
|---|---|
| `marketNonce`, `finalized`, `booksEmpty`, `marketExpiryNs` (4 external views) | ~12k |
| `closingTop(8)` | ~15k |
| `getBookLevels(true, 8)` + `getBookLevels(false, 8)` | ~60k |
| VWAP arithmetic over 16 levels | ~20k |
| Storage writes (dwell state) | ~25k |
| Action dispatch (`call` to target) | user-specified cap |

Comfortably inside 10M even with a generous action cap. **Do not raise `maxLevels` above 8 without
re-measuring** — `getBookLevels` cost scales with level count.

## 8. Explicitly out of scope

- No TWAP, no EMA, no volatility estimate. Depth-weighted mid + dwell is sufficient and defensible.
- No cross-market correlation.
- No off-chain probability. If the frontend and the handler ever disagree, **the handler is right.**
  The UI must compute probability from the same on-chain reads, never from the REST indexer, which
  lags by seconds.
