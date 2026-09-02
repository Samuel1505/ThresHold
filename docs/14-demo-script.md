# 14 — Demo Script (3:00)

## The one thing the video must prove

> A market belief caused an autonomous on-chain action, with no keeper and no user transaction.

Everything else is subordinate. If a segment doesn't serve that, cut it.

## Pre-flight (before recording)

- [ ] `ec-maker` running, two-sided book, target market has ≥20 min to expiry
- [ ] Registry balance ≥ 35 STT (visible in the UI banner)
- [ ] `DemoVault.reset()` called; `riskyBalance` funded, `safeBalance` = 0
- [ ] Frontend deployed; `/demo` open
- [ ] Explorer open in a second tab, filtered to the vault
- [ ] Terminal ready with a `placeLimit` command **pre-typed, not pre-run**
- [ ] Screen at 1920×1080; browser zoom 125% so numbers are readable on a phone
- [ ] One full dry run completed in the last hour

## Sequence

**0:00–0:15 — Problem**
Screen: a liquidation transaction on an explorer.
> "Every automation on-chain fires after the fact. By the time your keeper submits, the loss is
> already taken. There's no way to act on what's *likely*."

**0:15–0:35 — The signal**
Screen: Market Detail. Probability gauge, order book, depth chart.
> "A DreamDEX Event Contract is a binary market. Its mid price is a probability — bounded, live, and
> backed by real capital, because everyone quoting it loses money for being wrong. And it's on-chain."

Cursor traces the gauge as a fill moves it.

**0:35–0:55 — Configure**
Screen: Trigger Builder.
> "I want my treasury to de-risk when the market thinks a drop is likely. Threshold: 70%. It has to
> hold for 30 seconds. Minimum depth so a thin book can't fake it."

Click **Arm**. One transaction. State badge → `ARMED`.

**0:55–1:30 — Move the market**
Split screen: terminal left, `/demo` right.
Run the pre-typed `placeLimit` crossing order.
> "Now a trader takes the other side."

Probability climbs. Gauge crosses 70%. State → `OBSERVING`. Dwell ring starts.
> "It crossed. But it doesn't fire yet — it has to hold."

**1:30–1:45 — Dwell**
Ring counts down. Let it run. Do not talk over the last five seconds.

**1:45–2:00 — Execution**
Pulse animation fires left-to-right. `DemoVault` panel: `riskyBalance` → `safeBalance`.
> "No transaction was sent to that vault. No bot was running. No keeper. The market's belief executed
> it."

**2:00–2:20 — The proof**
Screen: Trigger Detail execution card, both block numbers side by side. Cut to explorer showing the
vault's state change.
> "Same block as the fill that caused it." *(or, if PHASE 0.7 showed otherwise: "Automatically, one
> block later, with no keeper anywhere in the system.")*

**2:20–2:40 — Manipulation guard** ← *the segment that separates this from a prototype*
Cancel the maker's quotes to thin the book. Send a single small crossing order.
Screen: touch price spikes; `GateChecklist` shows **G8 Depth: FAIL**; probability greyed out; the
armed trigger does not move.
> "One fill against a thin book moves the last price. It doesn't move a depth-weighted mid across
> eight levels. The trigger ignores it."

**2:40–3:00 — Vision**
Screen: dashboard with three armed triggers on three markets.
> "Any contract. Any action. Any question a market can price. Oracles tell you what already happened.
> Threshold lets your contracts act on what the market is willing to bet will happen next."

## Recording notes

- **Do not speed up the dwell.** The 30 seconds of nothing happening is what makes the execution land.
- **Do not narrate the manipulation segment before it happens.** Let the judge see the failure state.
- Show the block numbers on screen long enough to read — 3 seconds minimum.
- If the live run fails during recording, re-record. Do not cut around a failure; it always shows.
- Keep a successful full-run recording as a backup before attempting a better take.

## Backup plan

If Reactivity is flaky on the day, record from a **local Anvil** deployment with a mocked precompile
call, and **say so on screen**: "recorded locally for reliability; Shannon deployment at
0x…, transaction 0x…". A judge who is told forgives; a judge who discovers does not.
