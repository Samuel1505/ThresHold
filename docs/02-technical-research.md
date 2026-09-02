# 02 — Technical Research & Dependency Audit

> **Method.** Every entry below was verified by extracting and reading the published packages
> (`@somnia-chain/markets-sdk@0.29.0`, `@somnia-chain/reactivity-contracts@0.2.1`) and the
> `somnia-chain/dreamdex-bot-kit` repository at commit dated 2026-08-24. Where a claim could not be
> verified from source, it is marked `NEEDS VERIFICATION` and a fallback is specified.
>
> **`docs.dreamdex.io` blocks automated access.** Claude Code should open it manually and reconcile.

---

## Networks

| | Shannon testnet | Mainnet |
|---|---|---|
| Chain ID | `50312` | `5031` |
| Collateral | TestUSDC `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` (**6 dp**, public `faucet(uint256)`) | USDso `0x00000022dA000002656c64D9eA6011ea952D008A` (18 dp) |
| REST | `https://stg.api.dreamdex.io/v0` | `https://api.dreamdex.io/v0` |
| WS | `wss://stg.api.dreamdex.io/v0/ws/public` | `wss://api.dreamdex.io/v0/ws/public` |

`NEEDS VERIFICATION` — public RPC URL and explorer URL for Shannon. Get from https://docs.somnia.network.

## DreamDEX protocol addresses

CREATE3-deterministic, **identical on both chains**. Source: `packages/ec-core/src/addresses.ts`, verified against
`smart-contracts/deployments/<chainId>/` on 2026-07-24.

| Contract | Address | Status |
|---|---|---|
| BinaryMarketsModule | `0x3ecC694Cef705358864a646142ac17A90E29e388` | `CONFIRMED` |
| MarketsCore | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` | `CONFIRMED` |
| ClobFactory | `0xb2BE8EE02F96379DB75f01802384593EBa9bfF04` | `CONFIRMED` |
| BinaryPoolImpl | `0x82A1FcdaA2daC2fC7D5f9909D43E68021eE966FD` | `CONFIRMED` |
| BinarySettlement | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` | `CONFIRMED` |
| CollateralRouter | `0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C` | `CONFIRMED` |
| MarketCreatorFactory | `0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B` | `CONFIRMED` |
| OracleHub | `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b` | `CONFIRMED` |
| MarketCreator (testnet, venue 2 — the live one) | `0x5Ce69567dB39C8fBAd7e048bEfdbcCdfE67B44e6` | `CONFIRMED` |

> Individual **BinaryPool** addresses are **per-market and discovered at runtime**. Never hardcode one.
> Venue IDs moved three times in the first week of August 2026 — read `venueId` off a live market row.

---

## THE CRITICAL DEPENDENCY — resolved

**Question:** does a DreamDEX BinaryPool emit an event a Somnia Reactivity subscription can bind to?

**Answer: YES. `CONFIRMED`.**

`@somnia-chain/markets-sdk/dist/eventsAbi.d.ts` line 1–2:

> *"Order lifecycle events shared by SpotPool + BinaryPool (the OrderBook base)."*

`orderBookEventsAbi` contains:

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

- `topic0 = keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)")`
- `fillPrice` is **non-indexed** → arrives in the callback's `data` payload, not `eventTopics`.
- Emitted by the **BinaryPool** contract → subscription `emitter` = the pool address.

**Correction to prior assumptions:** `MarkPriceUpdated` is in `spotPoolEventsAbi` and is **SpotPool-only**.
Binary pools do NOT emit it. Any design depending on `MarkPriceUpdated` from a binary pool is wrong.

**Warning carried in the SDK source** (`perpPoolEventsAbi` comment): a previous ABI claim was false, and
because a wrong arity produces a different `topic0`, `watchEvent` silently filtered on something no pool ever
emitted. **Verify `topic0` against a real emitted log before trusting it** (see `12`, adversarial test A1).

---

## Component capability matrix

| Component | Capability | Status | Evidence | Risk |
|---|---|---|---|---|
| BinaryPool | `OrderFilled` event | `CONFIRMED` | `orderBookEventsAbi`, doc comment naming BinaryPool | Verify topic0 on live log |
| BinaryPool | `getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])` | `CONFIRMED` | `readsAbi.js` L30, "verified against smart-contracts: BinaryPool (OrderBook)" | Gas cost inside callback |
| BinaryPool | `closingTop(uint256 maxSteps) view returns (uint256 bestBid, uint256 bestAsk, bool bidFound, bool askFound)` | `CONFIRMED` | `readsAbi.js` L58; comment: "dual-regime raw top (pre-expiry: best live…)" | Confirm pre-expiry semantics on live pool |
| BinaryPool | `getBinaryPoolParams()` → incl. `oneCollateral`, `market`, `yesId`, `noId`, `marketNonce`, `finalized` | `CONFIRMED` | `readsAbi.js` L59 | — |
| BinaryPool | `marketNonce() view returns (uint64)` | `CONFIRMED` | `readsAbi.js` L46 | — |
| BinaryPool | `booksEmpty()`, `finalized()`, `marketExpiryNs()`, `setBacking()` | `CONFIRMED` | `readsAbi.d.ts` L93–117 | — |
| BinaryPool | Book is quoted **in YES terms on both legs** | `CONFIRMED` | `ec-core/src/orders.ts` L114–116: `priceYes = outcome === "YES" ? priceOwn : one - priceOwn` | — |
| BinaryPool | Pools are **recycled** across markets; `marketNonce` increments | `CONFIRMED` | `readsAbi.js` L41 comment; `binaryPoolEventsAbi` `PoolRecycled` | **Must pin triggers to nonce** |
| Reactivity | Precompile at `address(0x0100)` | `CONFIRMED` | `SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS` | — |
| Reactivity | `subscribe(handler, SubscriptionFilter, SubscriptionOptions) → uint256` | `CONFIRMED` | `@somnia-chain/reactivity-contracts@0.2.1` README + `SomniaExtensions.sol` | — |
| Reactivity | Filter = `{ bytes32[4] eventTopics, address origin, address emitter }` | `CONFIRMED` | same | Filter by pool address + topic0 |
| Reactivity | `SomniaEventHandler` base restricts `onEvent` to `0x0100`, reverts `OnlyReactivityPrecompile()` | `CONFIRMED` | `contracts/SomniaEventHandler.sol` | — |
| Reactivity | `SUBSCRIPTION_OWNER_MINIMUM_BALANCE = 32 ether` — **on the subscribing contract** | `CONFIRMED` | `SomniaExtensions` constants; error `InsufficientBalance()` | **See BLOCKER-1** |
| Reactivity | `MAXIMUM_HANDLER_GAS_LIMIT = 200_000_000`; default `10_000_000` | `CONFIRMED` | same | Ample for book reads |
| Reactivity | `MINIMUM_BASE_FEE_PER_GAS = 6 gwei`; `DEFAULT_MAX_FEE_PER_GAS = 20 gwei` | `CONFIRMED` | same | Subscription must stay funded |
| Reactivity | `scheduleSubscriptionAtTimestamp(handler, timestampMillis, options)` | `CONFIRMED` | `SomniaExtensions` methods list | **Used for dwell expiry — see `08`** |
| Reactivity | Handler executes **in the same block** as the triggering event | `NEEDS VERIFICATION` | Claimed in Somnia docs; not provable from package source | **Demo depends on this.** Fallback: next-block execution is still keeper-free and the pitch survives with wording changed from "same block" to "automatically, no keeper" |
| Reactivity | ERC-165 `supportsInterface` checked by precompile | `CONFIRMED` | `SomniaEventHandler` implements IERC165 | Handler must not break it |
| Shannon | TestUSDC public `faucet(uint256)` | `CONFIRMED` | `addresses.ts` comment | — |
| Shannon | Obtaining ≥32 STT for the subscriber contract | `NEEDS VERIFICATION` | — | **BLOCKER-1** |
| markets-sdk | `npm` latest `0.29.0` (published 2026-09-01); bot kit pins `^0.28.1` | `CONFIRMED` | `npm view` | **Pin exactly. Caret range will pull an untested minor.** |
| DreamDEX | Operator/venue/market creation (`registerOperator`, `createVenue`, `createMarketCreator`) | `NEEDS VERIFICATION` | Present in SDK type defs | **NOT on Threshold's critical path — do not attempt** |
| DreamDEX | Multiple strikes per window | `NEEDS VERIFICATION` | `strike` is a market-row field | Cosmetic only for Threshold |

---

## BLOCKERS

### BLOCKER-1 — `SUBSCRIPTION_OWNER_MINIMUM_BALANCE = 32 ether`

`SomniaExtensions.subscribe` reverts `InsufficientBalance()` unless the **calling contract's** balance is
≥ 32 STT. Threshold's subscriber contract must therefore hold ≥32 STT on Shannon.

**This is the single blocker that can kill the project. Test it in the first hour** (see `16` PHASE 0).

- If 32 STT is obtainable from the Shannon faucet (possibly across several claims into an EOA, then
  forwarded to the contract): proceed as specified.
- `FALLBACK` if not obtainable: request testnet STT in the hackathon Telegram
  (`https://t.me/+XHq0F0JXMyhmMzM0`). This is a standard ask and sponsors normally grant it.
- `FALLBACK` if still not obtainable: see `05` §Last-resort implementation. The product degrades to an
  off-chain watcher submitting the same validated on-chain call. **The innovation claim weakens
  substantially** — say so honestly in the README rather than hiding it.

### Non-blocking hazards (from `dreamdex-bot-kit/docs/event-contracts.md`)

| Hazard | Detail | Mitigation |
|---|---|---|
| 18-decimal price bug | Unified `createOrder` does `parseUnits(price.toFixed(18), 18)`; `(0.05).toFixed(18)` = `0.050000000000000003`, off the tick grid → `InvalidPrice`. **Invisible on 6-dp testnet.** | Use `placeLimit` from `ec-core` for all demo-side order placement |
| Reverted writes do not throw | SDK writes skip simulation and resolve even on revert | Use `assertTxOk` from `ec-core` everywhere |
| `fetchOpenOrders()` with no symbol | Reaches across binary/spot/perp — the whole wallet | Always scope by symbol |
| Order expiry mandatory | Capped at market expiry; headroom must scale with `intervalSec` | Derive from `marketExpiryNs()` |
| Indexer lag | REST/WS lag chain by seconds | **On-chain reads are the only authority for trigger logic** |
| Venue IDs move | Changed 3× in one week | Read from a live market row; never hardcode |

---

# TECHNICAL ASSUMPTION AUDIT (second pass)

The ten claims the spec demands be classified, plus the ones that actually matter.

| # | Claim | Status | Basis |
|---|---|---|---|
| 1 | **DreamDEX binary markets emit a subscribable event** | ✅ **CONFIRMED** | `orderBookEventsAbi` doc comment: *"shared by SpotPool + BinaryPool (the OrderBook base)"*. `OrderFilled` with `fillPrice`. **This was the project's single load-bearing assumption and it holds.** |
| 2 | **On-chain order-book access from Solidity** | ✅ **CONFIRMED** | `getBookLevels(bool,uint64)`, `closingTop(uint256)`, `getBinaryPoolParams()` in `readsAbi.js`, header comment: *"verified against smart-contracts: BinaryPool (OrderBook)"* |
| 3 | **Probability formula** | ✅ **CONFIRMED** | Book quoted in YES terms both legs (`ec-core/orders.ts` L114–116). `P = yesPrice / oneCollateral`, `oneCollateral` read from pool |
| 4 | **Reactivity event subscription by emitter + topic** | ✅ **CONFIRMED** | `SomniaExtensions.SubscriptionFilter { bytes32[4] eventTopics, address origin, address emitter }` |
| 5 | **Reactivity callback execution model** | ✅ **CONFIRMED** | `SomniaEventHandler.onEvent` restricted to `0x0100`, ERC-165 verified by precompile |
| 6 | **Subscription funding: 32 STT on the calling contract** | ✅ **CONFIRMED** (constant) / ⚠️ **NEEDS VERIFICATION** (obtainable on Shannon) | `SUBSCRIPTION_OWNER_MINIMUM_BALANCE = 32 ether`, `InsufficientBalance()`. **BLOCKER-1** |
| 7 | **Callback gas limits** | ✅ **CONFIRMED** | default `10_000_000`, max `200_000_000`. Est. ~130k needed per trigger |
| 8 | **Arbitrary target execution** | ✅ **CONFIRMED** | Plain Solidity `call`. Constrained by our own allow-list, not by the platform |
| 9 | **Shannon testnet deployment** | ⚠️ **NEEDS VERIFICATION** | Addresses confirmed; RPC/explorer URLs and faucet limits not |
| 10 | **Compatibility with existing DreamDEX markets** | ✅ **CONFIRMED** | Threshold is read-only against pools. No creation, no permissions, no venue setup |
| 11 | **Same-block callback execution** | ⚠️ **NEEDS VERIFICATION** | Claimed in Somnia docs; not provable from package source. **Demo wording depends on it.** Fallback: next-block is still keeper-free |
| 12 | **`scheduleSubscriptionAtTimestamp` for dwell expiry** | ✅ **CONFIRMED** (exists) / ⚠️ **NEEDS VERIFICATION** (behaviour) | Listed in `SomniaExtensions` methods |
| 13 | **Pools are recycled across markets** | ✅ **CONFIRMED** | `PoolRecycled` in `binaryPoolEventsAbi`; `marketNonce()` in `readsAbi` |
| 14 | Operator / venue / market creation | ⚠️ **NEEDS VERIFICATION** | **Not on Threshold's path. Do not attempt.** |

## What was disproved

- ❌ **`MarkPriceUpdated` from a binary pool.** It is in `spotPoolEventsAbi` — **SpotPool-only**. An
  earlier design sketch assumed binary pools emit it because dreamDEX's `SpotStopOrderRegistry` uses
  it. That inference was wrong. `OrderFilled` is the correct event and it *is* shared.
- ❌ **"dreamDEX is zero-fee" applied to binaries.** Binary venue params carry `makerFeeBps`,
  `takerFeeBps`, `settlementFeeBps`. Zero-fee is a spot claim. Irrelevant to Threshold, fatal to any
  strategy design that assumed it.

## Verdict

The architecture in `03`–`08` rests on ✅-confirmed capabilities, with one funding blocker
(**BLOCKER-1**) and one cosmetic uncertainty (**#11, same-block**) that changes demo wording but not
the design.

**PHASE 0 exists to close #6, #9, #11 and #12 in the first two hours.**

---

# PHASE 0 RESULTS

> Harness: `contracts/src/phase0/MinimalSubscriber.sol`, `scripts/src/03-06*.ts`.
> Runbook: `docs/PHASE0-RUNBOOK.md`. Packages extracted and read from source:
> `@somnia-chain/reactivity-contracts@0.2.1`, `@somnia-chain/markets-sdk@0.28.1` (and `0.29.0` for
> comparison).

## Resolved from package source + Somnia docs (2026-09-02)

| Item | Result |
|---|---|
| **#6 — 32 STT is on the *calling* contract** | ✅ `CONFIRMED`. `SomniaExtensions._subscribe` checks `address(this).balance < SUBSCRIPTION_OWNER_MINIMUM_BALANCE` (32 ether). `SomniaExtensions` is a `library` with `internal` fns → inlined into the caller → `address(this)` **is the subscriber contract**. docs/03's open question is closed: the **Registry** subscribes and must hold ≥ 32 STT. |
| **#9 — Shannon RPC / explorer** | ✅ Resolved from docs.somnia.network. RPC `https://api.infra.testnet.somnia.network` (alt `https://dream-rpc.somnia.network`); WS `wss://api.infra.testnet.somnia.network/ws`; explorer `https://shannon-explorer.somnia.network` (Blockscout, api at `/api`); chain `50312`. Multicall3 `0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223`. Faucets: `testnet.somnia.network`, Google Cloud web3 faucet. |
| **#12 — `scheduleSubscriptionAtTimestamp`** | ✅ Exists in `SomniaExtensions.sol`. Requires `timestampMillis > (block.timestamp+1)*1000 + 1` (reverts `TimestampInPast`). Builds a filter with `topic0 = Schedule.selector`, `topic1 = bytes32(timestampMillis)`, `emitter = 0x0100`. Behaviour on-chain still needs a live check (0.6-style) but the API is real. |
| **`onEvent` selector** | The precompile calls `ISomniaEventHandler.onEvent.selector` — `_buildSubscriptionData` hard-codes it. `SomniaEventHandler` gates `msg.sender == 0x0100`, implements ERC-165 for `IERC165` + `ISomniaEventHandler`. Do not override. |
| **`OrderFilled` topic0** | `keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)")` = `0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399`. Matches the local signature hash. **Live-log confirmation = 0.5, pending a real fill.** |

## ⚠️ Correction — `closingTop` is NOT in `markets-sdk@0.28.1`

docs/02 (method header) and docs/07 §2 cite `closingTop(uint256 maxSteps)` as `CONFIRMED` "from
`readsAbi.js` L58". It is **only in `0.29.0`** (readsAbi.ts L61), and even there its comment says
*"capture-generation pools only; older pools lack the selectors"*. CLAUDE.md + docs/06 mandate pinning
`0.28.1` exactly.

**Decision:** pin `0.28.1`; **do not use `closingTop` or `closingPrice`.** Derive top-of-book and
spread from `getBookLevels(isBid, 1)` — the `FALLBACK` docs/07 §2 already names. Works on every pool
generation, marginally more gas. `ProbabilityLib.snapshot()` and the TS port use `getBookLevels` only.
`0.28.1` `binaryPoolReadAbi` provides: `getBookLevels`, `getBinaryPoolParams`, `marketNonce`,
`finalized`, `booksEmpty`, `marketExpiryNs`, `setBacking`, `getOrderBookParameters`.

Other drift noted (cosmetic, we read from live rows):
- Indexer is **GraphQL** `https://dev.smk.somnia.host/v1/graphql`, not the REST URL in the table above.
- `0.28.1` testnet `marketCreator` = `0x138CfA6b80475b8c03d7E468b2442278E51e645a` (table says `0x5Ce6…`).
- Live testnet `VENUE_ID` (bot-kit docs): `0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c` — but Shannon currently shows live markets across ~5 venues; scope explicitly.

## Verified live on Shannon — ALL PASS (2026-09-02)

Deployer `0x89a68d0731F9Bc419d606f1F31Ead04c3fBDFdd6`. Throwaway
`MinimalSubscriber` at `0xEAB72940c8a186fB656CAC759218d9671e8cc687` (unsubscribed +
drained after the run; delete `src/phase0/` before PHASE 1).

| Task | Status | Evidence |
|---|---|---|
| **0.1 — 32 STT obtainable** | ✅ PASS | Deployer EOA held **40.99 STT** from the faucet — no Telegram ask needed. BLOCKER-1 closed. |
| **0.2 — a contract can hold 32 STT and subscribe** | ✅ PASS | Deployed `MinimalSubscriber`, funded exactly `32 ether`, `subscribeToPool(pool, ORDER_FILLED_TOPIC0)` → `subId = 15474162`, tx `0x351647d8…`, gas 469_511 (~210k subscription-mgmt + overhead, matches `ISomniaReactivityPrecompile` doc). `InsufficientBalance()` does NOT revert at exactly 32 (`<`, not `<=`). |
| **0.3 — a live binary market exists** | ✅ PASS | `listBinaryMarkets({status:"Trading"})` + per-row `getMarketOnchain`. Target: BTC 24h, pool `0xA34e33f71C566134CeeCdd6869BcC693B3D69c17`, marketId `0x…010a14`, nonce 64, venue `0x679795a0…8a28c`. |
| **0.4 — pool reads decode** | ✅ PASS | `getBinaryPoolParams()` → 15-field tuple, `oneCollateral = 1_000_000` (1e6 ✓). `getBookLevels(true/false,8)` → live two-sided book. `marketNonce`/`finalized`/`booksEmpty`/`marketExpiryNs` all read. P(YES) derived on-chain. **No `closingTop`.** |
| **0.5 — topic0 vs a real log** | ✅ PASS | The crossing order's `OrderFilled` log AND the reactivity callback both carried topic0 `0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399` = `keccak256(sig)`. **No SDK arity bug.** `data` = 128 bytes (4×uint256): `quantityFilled=5e6`, `takerRemaining=0`, `makerRemaining`, `fillPrice≈227_488` (~0.2275). |
| **0.6 — callback fires** | ✅ PASS | `pnpm phase0:cross` placed a BUY_YES IOC (tx `0x21f799f1…`, 1 fill). `MinimalSubscriber.callbackCount` 0 → 1. `emitter` = the pool, correct topic0, 128-byte payload. The precompile invoked the handler with **no keeper**. |
| **0.7 — same block?** | ✅ **SAME BLOCK** | fill block `477759029` == callback block `477759029`. The strong pitch — *"executes in the same block as the fill that qualified it"* — **holds on Shannon**. Assumption #11 resolved YES; no fallback wording needed. |

**PHASE 0 GATE PASSED. Proceed to PHASE 1.** Total cost ~0.11 STT gas + one tUSDC faucet.
Assumptions #6, #9, #11, #12 all closed. The only correction carried forward is
`closingTop` (0.29.0-only → use `getBookLevels`, above).

---

# PHASE 5 RESULTS — deployed & proven on Shannon (2026-09-02)

| Contract | Shannon address |
|---|---|
| ThresholdRegistry | `0xb31014A95Da14e94900a5b8c58087E8f754e596d` |
| ThresholdHandler | `0x693DC66E334674d5FF1ECf846d64E5086187195e` |
| DemoVault (sentinel) | `0xcAc26cFD38d72F8730dEFA46a271D055246a1463` |

**Acceptance MET.** Trigger #3 (threshold 0.40 ABOVE, dwell 5s, target `DemoVault.derisk()`):
`ARMED → OBSERVING → EXECUTED`. `TriggerExecuted(id=3, probabilityBps=4490, success=true)` at block
`478022467`, `Derisked(0.1 STT)` same block. Vault `riskyBalance 0.1 → 0`, `safeAmount 0 → 0.1`.

- **Execution tx** `0x92e6717dbcc424f2e1a6d94442609b60b98e88146f87dbd4a3826c602ea96dea` — `from` = the
  **Registry** (subscription owner), `to` = Handler, calldata `onEvent(0x0100, [Schedule.selector,
  …], "")`. So the precompile **scheduled the tx from the Registry** — no user, no keeper, no bot.
- **Fill tx** `0xc7abe63c…` — an ordinary `placeOrder` on the DreamDEX pool. **No transaction was
  sent to the vault by anyone.**
- **`scheduleSubscriptionAtTimestamp` behaviour CONFIRMED** — the scheduled dwell-expiry tick is
  what fired the execution (assumption #12, previously NEEDS VERIFICATION → ✅).

## Shannon deployment gotchas (all cost real time)

| Issue | Fix |
|---|---|
| `forge script`/`forge create` EIP-1559 estimation produces a gas price below Shannon's 6 gwei basefee → `Transaction Failure` | Always deploy with **`--legacy`** (docs/18 note confirmed) |
| `forge script` assigns mainnet-like per-tx gas limits (~3.7M) for a multi-tx deploy → instant OOG. The 12.8 KB registry actually costs **~42.8M gas** on Shannon (~10x mainnet) | Deploy each contract with **`forge create`** (its `eth_estimateGas` is right), wire with `cast send`. `Deploy.s.sol` kept for reference / a chain with normal gas |
| `forge create --constructor-args … --rpc-url …` silently falls back to `localhost:8545` | Put `--rpc-url` / `--private-key` **before** `--constructor-args` |
| **Shannon's gas schedule is ~10x EVM standard.** A cold `SSTORE` (0→nonzero) needs **~1.5M gas *available*** even though it consumes ~220k | `MAX_ACTION_GAS` 500k → **2_000_000**; `subGasLimit` default 10M → **50_000_000** (max is 200M). `DemoVault` carries a **1-wei `safeBalance` sentinel** so the demo `derisk()` writes a warm slot (~20k) and fits a modest cap. |

> The **currently deployed** Registry predates the `MAX_ACTION_GAS`/`subGasLimit` bump (it has
> 500k / 10M). It works for the demo because the sentinel `DemoVault`'s `derisk()` is ~20k. A fresh
> deploy (or mainnet) uses 2M / 50M. Redeploy when the deployer is re-funded (32.98 STT is locked in
> the first registry `0xb31014A9…` by invariant I9 — recoverable only down to the 32-STT floor).
