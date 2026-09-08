# Threshold — Pitch Deck

Probabilistic automation for DreamDEX Event Contracts on Somnia.

---

## 1. The Overview

**Threshold lets a smart contract act on what the market believes *will* happen — before it happens.**

- It reads a prediction market's price as a live, capital-backed probability.
- When that probability crosses a line you set and *holds* there, your contract fires an action.
- No keeper. No bot. No off-chain watcher. The contract wakes itself up.

One line for the judges: *oracles tell your contract what already happened. Threshold tells it what the market is willing to bet happens next.*

---

## 2. The Problem

**Every automation primitive on-chain fires on a fact that has already happened.**

- Keepers poll, then submit. Liquidations trigger *after* the breach. By then the loss is taken.
- Acting on *expectation* has meant trusting an off-chain model no contract can verify — run by someone who loses nothing by being wrong.
- So on-chain systems are permanently reactive. They cannot act early.

---

## 3. The Solution

**A DreamDEX binary Event Contract's mid-price is a probability — bounded [0,1], refreshed continuously, backed by real money, and readable on-chain.**

Threshold treats it as a **sensor, not a betting venue.**

- **Depth-weighted, not last-price.** The signal is a notional-weighted mid across 8 levels per side. A wash trade moves the touch; it does not move this.
- **Dwell.** The probability must *hold* past the threshold for a set time — it has to survive arbitrage, not just blip.
- **No keeper.** A Somnia Reactivity subscription wakes the contract on every fill, and the contract schedules its own dwell-expiry tick. Off-chain infrastructure: zero.
- **Re-validated at execution**, not just when the timer starts. Eight gates: market identity, finalization, expiry, book depth, spread, two-sidedness.

> **Wait, what?** The contract has no operator keeping it alive. It funds its own subscription and re-arms itself on-chain.

---

## 4. The Product

**Live on Somnia Shannon. Deployed, verified, and already executed autonomously.**

| | |
|---|---|
| Live app | **getthreshold.vercel.app** |
| Chain | Somnia Shannon (50312) |
| First autonomous execution | `TriggerExecuted(id=3, probabilityBps=4490, success=true)` — tx `0x92e6717d…6dea`, sent from the Registry by the reactivity tick, **no human transaction to the target** |
| Tests | 99 passing, including an adversarial suite (thin-book manipulation, gas exhaustion, mid-dwell expiry) |

What a user does:
1. Pick a market. See its probability, computed from the same on-chain reads the contract uses.
2. Arm a trigger in **one transaction** — threshold, dwell time, minimum depth, target action.
3. That's it. No terminal, no monitoring. A "simulate a trade" button in the browser proves it end to end.

---

## 5. The Demonstration

**The one thing it proves: a market belief caused an autonomous on-chain action, with no keeper and no user transaction.**

1. Arm a trigger: "de-risk my treasury when the market thinks a drop is >70% likely, held for 30 seconds." One tx → `ARMED`.
2. A trade crosses the market. Probability climbs past 70%. State → `OBSERVING`. Dwell timer starts.
3. 30 seconds of nothing. The signal holds.
4. The action fires. Funds move from the risky vault to the safe vault.
   → **No transaction was sent to that vault. No bot was running. The market's belief executed it.**
5. **The manipulation guard:** thin the book, send one crossing fill. Last price spikes — the depth gate fails, the probability greys out, the armed trigger doesn't move.

---

## 6. The Future Vision

**Any contract. Any action. Any question a market can price.**

- **Treasuries** de-risk on the market's read of a depeg, an exploit, a rate decision — not after it clears.
- **DAOs** pre-authorize spending that executes only if the market believes a milestone will be hit.
- **Protocols** pause, rebalance, or migrate on forward-looking market consensus instead of a lagging oracle.
- **Insurance / prediction-native products** settle on belief thresholds with no manual claims process.

Threshold turns every liquid Event Contract into a trigger source — and gives on-chain systems something they have never had: **the ability to act early.**
