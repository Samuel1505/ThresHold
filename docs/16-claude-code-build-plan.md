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

## PHASE 2 — Contracts (6h)
Create in order: `IBinaryPool.sol`, `ProbabilityLib.sol`, `ThresholdRegistry.sol`,
`ThresholdHandler.sol`, `DemoVault.sol`, `MockBinaryPool.sol`. Follow `04` exactly.
**Acceptance:** U1–U21 pass. `ProbabilityLib` fuzz (U8, U9) passes 10k runs.

## PHASE 3 — Probability engine hardening (3h)
Implement `snapshot()` and all eight gates. Write A4, A5, A10, A11 against `MockBinaryPool`.
**Acceptance:** A4 proves a single thin-level fill does not move the depth-weighted mid > 100 bps.

## PHASE 4 — Reactivity wiring (4h)
`_subscribe` / `_unsubscribe` in the registry. `_onEvent` dispatch loop with per-trigger `try/catch`.
`scheduleSubscriptionAtTimestamp` for dwell expiry. Emit an event on **every** callback entry —
without it, silent failures are undiagnosable.
**Acceptance:** A1, A2, A3, A6, I3, I5 pass. **I5 measures < 10M gas for 16 triggers.**

## PHASE 5 — Deploy to Shannon (2h)
Per `13`. Fund registry. Allow-list `DemoVault.derisk()`. Arm one trigger by `cast`. Cross the market
manually. Confirm execution on-chain.
**Acceptance:** a real `TriggerExecuted` log exists on Shannon with no manual transaction to the vault.

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
