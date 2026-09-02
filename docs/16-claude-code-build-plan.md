# 16 — Claude Code Build Plan

> **Read this file first. Then `02`. Do not write code until PHASE 0 completes.**

## PHASE 0 — Verify the blockers (target: 2 hours, do not skip)

**Objective:** discover whether Threshold is buildable *before* investing in it.

| Task | Method | If it fails |
|---|---|---|
| **0.1 — Obtain 32 STT** | Claim from the Somnia faucet into an EOA; check whether repeated claims are possible | Ask in hackathon Telegram `https://t.me/+XHq0F0JXMyhmMzM0`. If refused → last-resort tier in `05` |
| **0.2 — Contract can hold and subscribe** | Deploy a 20-line `MinimalSubscriber` funded with 32 STT; call `SomniaExtensions.subscribe` with a dummy filter | `InsufficientBalance` → 0.1 failed. Other revert → read the error against `SomniaExtensions` |
| **0.3 — Find a live binary market** | `client.listBinaryMarkets({ status: "Trading" })` on Shannon; record `marketId`, pool address, `venueId` | No live markets → ask in Telegram which venue is active |
| **0.4 — Pool reads work** | `cast call` the pool: `getBinaryPoolParams()`, `closingTop(8)`, `getBookLevels(true,8)`, `marketNonce()` | ABI mismatch → re-extract from `markets-sdk@0.28.1` `readsAbi` |
| **0.5 — `topic0` is real** | Watch the pool for a live `OrderFilled`; compare the log's topic0 to `keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)")` | Mismatch → re-derive from the actual log. **This is the SDK's documented past failure mode** |
| **0.6 — Callback fires** | Subscribe `MinimalSubscriber` to that pool's `OrderFilled`; place a crossing order with `ec-core` `placeLimit`; assert the handler emitted | No callback → check subscription id, balance, gas params, ERC-165 |
| **0.7 — Same block?** | Compare the `OrderFilled` block to the handler's emitted block | Different → **not fatal.** Change the pitch from "same block" to "automatically, no keeper" everywhere |

**Gate:** 0.1, 0.2, 0.5 and 0.6 must pass. If 0.1/0.2 fail and the Telegram ask fails, switch to the
last-resort tier and update `00`, `05`, `15` and the README to state it plainly.

Write findings to `docs/02-technical-research.md` under a new `## PHASE 0 RESULTS` heading. **Do not
proceed with an unverified assumption.**

---

## PHASE 1 — Scaffolding (1h)
Foundry project + Next.js app in one repo. `pnpm` workspaces: `contracts/`, `web/`, `scripts/`.
Install `@somnia-chain/reactivity-contracts@0.2.1`, `@somnia-chain/markets-sdk@0.28.1` (exact), viem,
wagmi. Solidity `0.8.30`. Commit `foundry.toml`, `.env.example`, CI running `forge test`.
**Acceptance:** `forge build` and `pnpm --filter web build` both succeed.

## PHASE 2 — Contracts (6h) — ✅ DONE (2026-09-02)
Create in order: `IBinaryPool.sol`, `ProbabilityLib.sol`, `ThresholdRegistry.sol`,
`ThresholdHandler.sol`, `DemoVault.sol`, `MockBinaryPool.sol`. Follow `04` exactly.
**Acceptance:** U1–U21 pass. `ProbabilityLib` fuzz (U8, U9) passes 10k runs.

> Built + `Types.sol`. **45 tests pass** (`forge test`): U1–U21 in `test/unit/{ProbabilityLib,
> Registry,StateMachine}.t.sol`; U8/U9 fuzz at 10k runs (CI profile); plus early adversarial
> coverage in `test/unit/HandlerGuards.t.sol` (A2, A3, A7, A8, A14) and gate G7/G8. Contract sizes:
> Registry 12.1 KB, Handler 8.7 KB — well inside the limit. Two spec resolutions recorded in `04`
> and `07`: (1) `ProbabilityLib.PoolSnapshot` carries the `Level[]` book so `depthWeightedBps` can
> walk it per-trigger (`minDepthPerSide` is per-trigger); (2) the registry handler API is
> `applyEvaluation(id, state, dwellStart)` + `recordExecution(id, pBps, ok, ts)`.
> `scheduleSubscriptionAtTimestamp` is a stubbed no-op until PHASE 4 (fill-driven meanwhile).

## PHASE 3 — Probability engine hardening (3h) — ✅ DONE (2026-09-02)
Implement `snapshot()` and all eight gates. Write A4, A5, A10, A11 against `MockBinaryPool`.
**Acceptance:** A4 proves a single thin-level fill does not move the depth-weighted mid > 100 bps.

> `snapshot()` + gates landed in PHASE 2. **A4, A4b, A5, A10, A11, A11b** in
> `test/adversarial/ProbabilityAttacks.t.sol` — A4 demonstrates a **195-bps touch spike** moving the
> depth-weighted mid **< 100 bps**, trigger stays ARMED. Plus 8 edge/fuzz tests in
> `test/unit/ProbabilityEdges.t.sol` (zero-qty / zero-price levels, 18-dp collateral, price >
> `oneCollateral` clamp, `maxLevels` truncation, empty pool). **59 tests pass** (CI profile, 10k
> fuzz). **Hardening bug found + fixed:** `_convert` could revert on `price * quantity` overflow
> from a hostile pool — snapshot is on the callback path, so it now saturates to `uint128.max`
> instead. `test/mocks/LibHarness.sol` exposes the internal lib for direct assertions.

## PHASE 4 — Reactivity wiring (4h) — ✅ DONE (2026-09-02)
`_subscribe` / `_unsubscribe` in the registry. `_onEvent` dispatch loop with per-trigger `try/catch`.
`scheduleSubscriptionAtTimestamp` for dwell expiry. Emit an event on **every** callback entry —
without it, silent failures are undiagnosable.
**Acceptance:** A1, A2, A3, A6, I3, I5 pass. **I5 measures < 10M gas for 16 triggers.**

> `_subscribe`/`_onEvent`/`try-catch`/`CallbackEntered` landed in PHASE 2. This phase added the
> dwell-expiry schedule: `registry.scheduleDwellExpiry(tsMillis)` (only the registry can — it holds
> the 32 STT), best-effort with an internal `try/catch` (`DwellExpiryScheduled` /
> `DwellExpiryScheduleFailed`). The handler schedules **one tick per callback** at the latest
> concurrent dwell end — the tick re-evaluates every trigger, so shorter dwells are covered, and
> any fill evaluates earlier regardless. **68 tests pass** (CI, 10k fuzz):
> - **A1** `test/adversarial/Reactivity.t.sol` — constant == `keccak256(sig)` **and** matches a real
>   `MockBinaryPool.emitOrderFilled` log (3 topics, 128-byte data, `fillPrice` non-indexed).
> - **A2/A3** in `HandlerGuards.t.sol` (PHASE 2). **A6** — `OrderFilled` + scheduled tick in the same
>   block → exactly one `TriggerExecuted`, one `Derisked`.
> - **I3** — nonce mismatch → `EXPIRED`, never executes across any number of fills/ticks.
> - **I5** — 16 triggers, one callback: **fresh-qualify 597k gas, all-execute 595k** (measured with
>   a `vm.etch`-ed precompile that burns ~management-cost gas). **~6% of the 10M limit.**
> - Plus: dwell completes in a totally silent book via the scheduled tick; the tick re-validates
>   gates (one-sided book → resets, not blind-executes); a scheduling failure degrades to
>   fill-driven without bricking the callback.

## PHASE 5 — Deploy to Shannon (2h) — ✅ DONE (2026-09-02)
Per `13`. Fund registry. Allow-list `DemoVault.derisk()`. Arm one trigger by `cast`. Cross the market
manually. Confirm execution on-chain.
**Acceptance:** a real `TriggerExecuted` log exists on Shannon with no manual transaction to the vault.

> **MET.** Registry `0xb31014A95Da14e94900a5b8c58087E8f754e596d`, Handler
> `0x693DC66E334674d5FF1ECf846d64E5086187195e`, DemoVault
> `0xcAc26cFD38d72F8730dEFA46a271D055246a1463`. Trigger #3 fired
> `TriggerExecuted(id=3, probabilityBps=4490, success=true)` at block 478022467
> (tx `0x92e6717d…`, sent **from the Registry by the reactivity precompile's scheduled tick** — no
> user/keeper); `Derisked(0.1 STT)` same block. Full write-up + the Shannon deployment gotchas
> (`--legacy`, ~10x gas schedule, `forge create` not `forge script`, the cold-SSTORE 1.5M-available
> cliff → `MAX_ACTION_GAS` 2M / `subGasLimit` 50M / `DemoVault` 1-wei sentinel) in
> `docs/02` → `# PHASE 5 RESULTS`. `scripts/src/07-e2e-demo.ts` drives it end to end.

> **Milestone reached: the project is submittable.** The core claim — a market belief drove an
> autonomous on-chain action with no keeper — is demonstrable on Shannon.

> **Milestone: after PHASE 5 the project is submittable.** Everything after this raises the score;
> nothing after this is required for the core claim to be true. If time collapses, stop here and
> record the demo from `cast` output.

## PHASE 6 — TS probability port + parity tests (2h)
`web/lib/probability.ts` mirroring `ProbabilityLib`. Shared JSON fixtures.
**Acceptance:** P1, P2 pass exactly.

## PHASE 7 — Frontend (8h)
Order: chain config + wallet → Markets → Market Detail (gauge, book, `GateChecklist`) → Trigger
Builder with live preview → Active Triggers → Trigger Detail with `BeliefToActionFlow` → Dashboard.
Multicall every read. Poll 2s. Watch `TriggerExecuted`.
**Acceptance:** all seven MVP criteria in `01` pass in a browser.

## PHASE 8 — Demo page + rehearsal (3h)
`/demo` per `14`. Run the full sequence end to end **twice**. Fix whatever was flaky.
**Acceptance:** two consecutive clean runs.

## PHASE 9 — Adversarial completion (2h)
Any remaining A-tests. `forge coverage` ≥ 85% on the two core contracts.

## PHASE 10 — Docs & submission (3h)
README per spec. `15` submission text. Record the video. Push the repo.
**Optional, cheap, differentiating:** the SDK/docs feedback report the brief lists — you will have
found real issues (the 18-dp bug's testnet invisibility, the README omitting the EC half, the
`0.28.1` vs `0.29.0` drift). It maps to Technical Implementation and proves you ran the thing.

---

# CLAUDE CODE EXECUTION ORDER

1. Read `README.md`, `CLAUDE.md`, then all of `/docs` in numeric order.
2. Clone `somnia-chain/dreamdex-bot-kit`; read `docs/event-contracts.md` **fully**; load `skills/`.
3. Extract `@somnia-chain/markets-sdk@0.28.1` and `@somnia-chain/reactivity-contracts@0.2.1`; read
   `readsAbi`, `eventsAbi`, `SomniaExtensions.sol`, `SomniaEventHandler.sol` **from source**.
4. Open `https://docs.dreamdex.io/developers/event-contracts` and
   `https://docs.somnia.network/developer/reactivity`; reconcile against `02`; correct any drift and
   note it.
5. **Execute PHASE 0. Report results before writing production code.**
6. If a blocker fires, state it and propose the fallback from `05`. Do not silently work around it.
7. PHASES 1–5 in order, running tests after each.
8. Stop at the PHASE 5 milestone and confirm the core claim is demonstrable.
9. PHASES 6–10.

## Rules

- **Never implement against an unverified assumption.** Verify, or implement the documented fallback
  and say which one you used.
- **Never invent an API.** If a function is not in the extracted ABIs or the reactivity package, it
  does not exist. Say so.
- Run `forge test` after every contract change.
- Never commit a private key. `.env` is gitignored; `.env.example` has placeholders only.
- Prefer the simplest thing that satisfies the acceptance criteria.
- If a spec decision here turns out to be wrong against real chain behaviour, **change the code and
  update the doc**, and note it in `## PHASE 0 RESULTS`.

## Time budget

| Phase | Hours | Cumulative |
|---|---|---|
| 0 Verify | 2 | 2 |
| 1 Scaffold | 1 | 3 |
| 2 Contracts | 6 | 9 |
| 3 Probability | 3 | 12 |
| 4 Reactivity | 4 | 16 |
| 5 Deploy | 2 | **18 — submittable** |
| 6 TS port | 2 | 20 |
| 7 Frontend | 8 | 28 |
| 8 Demo | 3 | 31 |
| 9 Adversarial | 2 | 33 |
| 10 Submission | 3 | **36** |

~36 focused hours. Six days is enough with slack, and the slack is deliberate.
