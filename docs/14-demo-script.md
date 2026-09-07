# 14 — Demo Script (≤ 3:00)

## The one thing the video must prove

> A market's belief caused an autonomous on-chain action — no keeper, no bot, no user transaction to the target.

Every second serves that sentence. If a shot doesn't, cut it.

---

## What changed since the old script

- **No terminal. Anywhere.** The market cross is an in-browser button (`Simulate a trade` / `Cross the market →`). Judges and users never open a shell.
- **It's live:** `getthreshold.vercel.app` — Somnia Shannon, real contracts, real books.
- **There is already a real autonomous execution on-chain** — open on that, then reproduce it live.

---

## Pre-flight (within ~1 hour of recording)

- [ ] `getthreshold.vercel.app` loads; nav shows **Dashboard · Markets · Triggers · Demo · How it works**
- [ ] Dashboard: **Registry balance ≥ 33 STT** (no red/amber on the stat)
- [ ] `/markets`: use **BTC 1080h** or **ETH 1080h** — P(YES) ≈ **50%**, deep two-sided book, ~41 days
      runway (no recycle risk), maintained by a house maker so you don't run one. The 4h/24h rows are
      usually thin — ignore them.
      - BTC 1080h market id: `0x0000000000000000000000000000000000000000000000000000000000013b54`
      - ETH 1080h market id: `0x0000000000000000000000000000000000000000000000000000000000013b55`
- [ ] `/demo`: **Risky balance > 0**, **Safe balance = 0** — if not, click **Sweep safe → risky**
- [ ] Wallet (MetaMask) connected to Shannon, holds ~1 STT for the arm tx
- [ ] `DEMO_TRADER_PRIVATE_KEY` is set on the deployment (the `Simulate a trade` button is enabled, not greyed)
- [ ] Second tab: `shannon-explorer.somnia.network` open
- [ ] Screen 1920×1080, browser zoom 125%
- [ ] One clean dry run done in the last hour; keep that recording as backup

---

## Sequence

### 0:00–0:18 — It already happened

Screen: the explorer, on the existing execution tx
`0x92e6717dbcc424f2e1a6d94442609b60b98e88146f87dbd4a3826c602ea96dea`.
Point the cursor at the **From** field.

> "This is an on-chain transaction that moved funds in a vault. Nobody sent it. It came from a
> contract, because a prediction market crossed a line. Let me show you how."

### 0:18–0:38 — The problem

Screen: any liquidation / keeper tx on the explorer (or a keeper dashboard).

> "Every automation on-chain fires *after* the fact. The keeper polls, then submits — the loss is
> already taken. Acting on what's *likely* has always meant an off-chain model no contract can check,
> run by someone who loses nothing for being wrong."

### 0:38–1:00 — The signal

Screen: `getthreshold.vercel.app/markets` → click **BTC 1080h** → `/markets/0x…013b54`.
Let the probability gauge (≈ **50%**), the 8-level order book, and the **Gate check** panel settle.

> "A DreamDEX Event Contract is a binary market. Its mid price *is* a probability — bounded zero to
> one, live, backed by real capital because everyone quoting it loses money for being wrong. And it's
> on-chain. Threshold reads it as a sensor — a depth-weighted mid across eight levels, not the last
> trade."

Cursor traces the gauge. One beat on the **Gate check** panel — G1 to G8, all green.

### 1:00–1:22 — Arm it (one transaction)

Screen: **Arm a trigger →** → `/triggers/new?market=<id>`.

| Field | Set to | Say |
|---|---|---|
| Threshold | **~4 points below** current P(YES) (≈ 46% when it reads 50%) | "Act while the market's conviction is building — not after the event clears." |
| Direction | **Rises above** | |
| Dwell | **20s** | "And it has to *hold* above my line for twenty seconds — survive arbitrage, not just blink." |
| Action | **`DemoVault.derisk()`** | "Then move my treasury to safety." |

Right panel — **"Would this fire right now?"** reads **yes — starts dwell**, gates green.
Click **Arm …** → confirm the **single** MetaMask transaction.

> "One transaction. No deposit, no approval dance. It's armed, and the market's already past my line."

Screen: **"Trigger #N is armed"** → **Watch it →** → `/triggers/N`, badge **ARMED**.

### 1:22–1:52 — The market ticks, the dwell starts

Screen: `/triggers/N`. Right column → **"Waiting for a fill on this pool"** → click **Simulate a trade →**.

> "The trigger wakes on the market's own activity — a fill on this pool. Normally that's organic
> trading; here it's a button so it happens on cue."

The line returns: `BUY_YES · N · block <n> · crossed — 1 fill(s)`.
Badge **ARMED → OBSERVING**. The dwell ring starts counting down.

> "It re-read the book on-chain, confirmed the probability is still above my threshold, and started
> the clock. If it slips back under in the next twenty seconds, the dwell resets and nothing fires."

### 1:52–2:12 — Dwell

The ring counts down. **Say nothing for the last eight seconds.** Let the timer be the tension.

### 2:12–2:28 — Execution

The pulse animation runs left-to-right. Badge → **EXECUTED**.
The DemoVault panel: **risky → 0**, **safe → +0.1 STT**.

> "The dwell ran out. A tick the contract had scheduled *for itself* fired — from the Registry, no
> keeper in the system — and the action executed. No transaction was sent to that vault by anyone."

### 2:28–2:42 — The proof

Screen: the **Execution card** on `/triggers/N` — fill block and action block side by side.
Click the execution tx → explorer. Point at **From**.

> "The execution came *from the Registry contract*. Not my wallet. Not a bot. The fill came from a
> trader, into the pool — nothing ever touched the vault directly."

### 2:42–2:55 — The manipulation guard

Screen: arm a second trigger on the same market but set **Min depth per side** *above* what the book
holds on one side (e.g. 80,000 tUSDC). Then click **Simulate a trade** once.

> "This is what an attacker does — pull quotes until the book is thin, then push the price with one
> fill. Threshold requires real depth on both sides before it trusts the number. The depth gate
> fails, the probability greys out, and the trigger sits still through every fill."

Screen: **Gate check** shows **G8 Depth: FAIL**; gauge greyed; the trigger stays **ARMED**.

(Or, if a genuinely thin market is on the list at record time, use that directly.)

### 2:55–3:00 — Vision

Screen: Dashboard.

> "Any contract. Any action. Any question a market can price. Oracles tell your contracts what
> already happened. Threshold lets them act on what the market is willing to bet happens next."

---

## Spoken-claim guardrails (do not overstate)

- ✅ "No keeper / no bot / no off-chain watcher." — true; the subscription and the dwell-expiry tick are on-chain.
- ✅ "The execution came from the Registry." — true; verifiable on the explorer (`from` field).
- ✅ "It funds and re-arms its own subscription." — true.
- ❌ **Do not say "same block as the fill."** The action fires on the scheduled dwell-expiry tick,
  ~dwell seconds later. Say "automatically, moments later, with no keeper."
- ❌ Don't claim audited / production-ready. It's a verified testnet deployment.

## Recording notes

- **Do not speed up the dwell.** The 20 seconds of nothing is what makes the execution land.
- **Do not narrate the manipulation segment before it happens.** Let the failure state be seen.
- Hold every block number / `from` field on screen ≥ 3 seconds.
- If a live run fails mid-record, re-record. Don't cut around it — it always shows.
- Keep one full clean take as backup before chasing a better one.
- Reset between takes: `/demo` → **Sweep safe → risky**; arm a fresh trigger (ids only go up).

## Backup plan

1. **If the 1080h book is thin at record time** — a house maker keeps BTC/ETH 1080h near 50%, but if
   it's away, start the local maker: `cd ~/Desktop/dev/threshold-demo-maker && npm start -w ec-maker`
   (see its `RUNBOOK.md`), which seeds the **ETH 24h** book instead. Then demo there (P(YES) will be
   lower — arm ~3 points below whatever it reads).
2. **If Reactivity is slow** — lead and close on the **existing** execution tx `0x92e6717d…6dea` in
   the explorer (real, permanent), and narrate over the `/demo` page's live `TriggerExecuted` stream
   (pre-armed trigger `#3`).
3. **Last resort, local Anvil with a mocked precompile** — **say so on screen** and show the Shannon
   Registry `0xb31014A95Da14e94900a5b8c58087E8f754e596d` + tx `0x92e6717d…6dea`.
   A judge who is told forgives; a judge who discovers does not.
