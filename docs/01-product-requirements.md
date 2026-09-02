# 01 — Product Requirements (MVP)

## Primary user

A **smart-contract operator** — DAO treasury manager, protocol operator, or vault manager — who
already understands that automation exists and is frustrated that it only fires after the fact.

Secondary: a **Solidity developer** evaluating Threshold as a primitive.

**Not a target user:** a retail prediction-market trader. Threshold does not take positions.

## Core user flow

| # | Step | Screen | On-chain? |
|---|---|---|---|
| 1 | Connect wallet, switch to Shannon (50312) | any | no |
| 2 | Browse live binary markets | Markets | read |
| 3 | Inspect a market: probability, depth, spread, expiry | Market Detail | read |
| 4 | Set threshold + direction | Create Trigger | no |
| 5 | Set dwell, min depth, max spread | Create Trigger | no |
| 6 | Choose action (`DemoVault.derisk()` in MVP) | Create Trigger | no |
| 7 | Preview: would this fire right now? why not? | Create Trigger | read |
| 8 | Arm — one transaction | Create Trigger | **write** |
| 9 | Monitor live state and dwell progress | Trigger Detail | read |
| 10 | Trigger fires autonomously | — | **Reactivity** |
| 11 | See fill tx and action tx sharing a block number | Trigger Detail | read |

## Screens

### Dashboard
Registry subscription balance (with warning below ~35 STT), count by state, recent executions,
network/chain guard.

### Markets
Table of live binary markets: symbol, asset, strike, expiry countdown, probability, spread, depth,
"tradable" badge. Sourced from `listBinaryMarkets({ status: "Trading" })`, **probability re-derived
from on-chain reads**, not from the REST field.

### Market Detail
Large probability gauge; order book (8 levels each side); depth visualization with the
`minDepthPerSide` line overlaid; spread; time to expiry; `marketNonce`; pool address.

### Create Trigger
Threshold slider over a live probability sparkline so the user sees the threshold against actual
movement. Direction toggle. Dwell selector (5s / 30s / 60s / custom). Advanced: min depth, max
spread, gas cap, recurring + cooldown. Action selector. **Live preview panel** showing each gate
G1–G8 as pass/fail against the current book — this is the screen that teaches the concept.

### Active Triggers
Cards with state badge, live probability vs threshold, dwell progress ring when OBSERVING.

### Trigger Detail
Full config, state timeline, probability history since arming, execution record with **both block
numbers side by side**.

### Demo
A single page that scripts the demo: DemoVault balances, a live probability readout, an armed
trigger, and an execution log. Built for recording, not for users. **Build this — the video is 15%.**

## UX states (every screen must handle all)

| State | Treatment |
|---|---|
| Wallet disconnected | Read-only browsing works; arming prompts connect |
| Wrong network | Blocking banner + "Switch to Somnia Shannon" button |
| Loading | Skeletons, never spinners on the probability gauge |
| No liquidity | Gauge greys out: "Book too thin to evaluate" + which gate failed |
| One-sided book | "One-sided book — no valid mid" |
| Stale / expired market | Struck through, "Market expired" |
| Subscription underfunded | **Global banner.** This will happen during the demo if unwatched |
| Tx pending | Inline, with explorer link |
| ARMED / OBSERVING / EXECUTED | Distinct colors; OBSERVING shows a dwell countdown ring |
| Execution failed | Red, with revert reason if available |

## Visual concept

The UI must carry **belief → threshold → action** on one screen. The Trigger Detail page is a
horizontal three-panel layout: live probability (left) → threshold line and dwell ring (center) →
target contract state (right), with an animated pulse traveling left-to-right when it fires.

## Acceptance criteria for MVP-complete

1. Markets list shows ≥1 live Shannon market with a probability matching an independent on-chain read.
2. A trigger can be armed in one transaction and appears as `ARMED`.
3. Crossing the threshold with real fills moves it to `OBSERVING` with a visible dwell timer.
4. Sustained qualification executes the action without any manual transaction.
5. Trigger Detail shows the fill block and the action block.
6. A single thin-book fill spikes the touch price and does **not** move the trigger past its gates —
   visible in the UI.
7. Cancelling returns `CANCELLED` and unsubscribes when it is the last trigger on that pool.

## Explicit non-goals
Mobile-first layout, multi-chain, mainnet, trading, portfolio tracking, notifications, accounts.
