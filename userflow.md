# Threshold — user flow

Straightforward walkthrough. Every step: where you are, what you click, what you see back.

The app runs in the browser against the live Shannon testnet deployment. No terminal, no backend.
A trigger fires when a market's depth-weighted probability crosses your threshold and holds — the
on-chain reactivity precompile calls the handler, the handler checks the gates and dwell, then calls
the target. Nobody presses a "fire" button.

---

## Start the app

```bash
cd web
pnpm install
cp ../.env.example .env.local
pnpm dev
```

Open **http://localhost:3000**.

Optional — to use the **Simulate a trade** button, add one line to `web/.env.local`:
`DEMO_TRADER_PRIVATE_KEY=0x…` (a throwaway key holding STT + tUSDC). Without it the button is
disabled; everything else works, you just wait for real market fills.

## Wallet setup

Add Shannon to MetaMask, then get ~1 STT from https://testnet.somnia.network/

| Field | Value |
|---|---|
| RPC | `https://api.infra.testnet.somnia.network` |
| Chain ID | `50312` |
| Symbol | `STT` |

---

## The nav bar

Five links, top left: **Dashboard · Markets · Triggers · Demo · How it works**.
Wallet button, top right: **Connect wallet**.

---

## Flow 1 — Look around (no wallet needed)

| You are on | You click | You see |
|---|---|---|
| any page | **Dashboard** | Registry balance, your active triggers (0), watched pools, live market count. Amber/red on the balance stat if the subscription is low on STT — it's a real on-chain read. |
| Dashboard | **Browse markets →** | `/markets` — the list of live BTC/ETH binary markets. |
| `/markets` | — | Table with a live **P(YES)** column, top mid, spread, min depth, status. P(YES) is recomputed from the on-chain order book on every poll, not from an API. **Some rows will show `-` / `thin` / `no mid`** — that market's book is genuinely empty or one-sided right now (a window just recycled and no maker has requoted it yet). That's correct, honest behavior, not a bug — pick a different row. |
| `/markets` | a market row | `/markets/<id>` — probability gauge, order book (8 levels/side), depth chart, a **Gate check** panel (G1–G8 with live reasons), and the pool's existing triggers. |
| any page | **Demo** | `/demo` — the DemoVault's risky/safe balances and a live `TriggerExecuted` stream from the handler. |
| any page | **How it works** | `/docs` — the mechanism, the eight gates, the deployed contract addresses, stated limitations. |

---

## Flow 2 — Arm a trigger

1. **`/markets`** → click a row that shows a real **P(YES)** percentage (not `-`) and a **tradable**
   badge, not **thin**. A 24h market is *not* always the right pick — whichever window recycled
   most recently often has no book yet. Trust the table, not the label. You land on `/markets/<id>`.
2. Read the **P(YES)** on the gauge — assume it shows **62%**.
3. Top right: **Connect wallet** → approve in MetaMask. If you're on the wrong network a red
   **Wrong network** button appears — click it to switch to Shannon.
4. Click **Arm a trigger →**. You land on `/triggers/new?market=<id>`.
5. Set the fields:

| Field | Value | Note |
|---|---|---|
| Threshold | `50%` | below the current 62% so it qualifies right away |
| Direction | Rises above | |
| Dwell | `30s` (or `5s` for a fast demo) | how long it must hold |
| Action | `DemoVault.derisk()` | the only demo action |

6. Right panel — **"Would this fire right now?"** shows **yes — starts dwell**, and the gate
   checklist is all green.
7. Click **Arm — 50% above · hold 30s** → confirm the single transaction in MetaMask.
8. Response: **"Trigger #N is armed"** with a checkmark, plus **Watch it →** and **View tx**.
9. Click **Watch it →**. You land on `/triggers/N`. State badge: **ARMED**. The page auto-refreshes.

---

## Flow 3 — See it fire

In real use you stop after Flow 2 — you leave, and it fires when the market actually crosses and
holds. To see it now on `/triggers/N`:

1. Right column, **"Waiting for a fill on this pool"** panel → click **Simulate a trade →**.
2. The button reads **Placing order…**, then a line appears:
   `sell · 8 · block <n> · crossed — 1 fill(s)` with a tx link.
   (If it says `no fill (touch moved) — try again`, click it again.)
3. Watch the state badge and the belief-to-action panel:

```
ARMED  →  OBSERVING  (dwell ring counts down)  →  EXECUTED  (green pulse)
```

4. After it executes:

| Where | What you see |
|---|---|
| Belief-to-action panel | DemoVault flips: `risky → 0`, `safe → +0.1 STT` |
| Execution card | appears at the top — fill block and action block, side by side |
| Timeline | `dwell started` → `armed → observing` → `executed at ~62% · action succeeded` |
| `/demo` | the same execution shows in the live stream |

---

## Flow 4 — Verify it was autonomous

1. On `/triggers/N`, in the **Execution card**, click the execution tx link → block explorer.
2. Check `from` on the execution tx = the **Registry** contract (not your address, not a bot).
   The precompile scheduled it.
3. Open the fill tx: `from` = the trader, `to` = the **pool**. Nothing was ever sent to the vault.

---

## Flow 5 — Cancel a trigger

1. Arm a second trigger (Flow 2).
2. On its page, while state is **ARMED** or **OBSERVING**, right column → **Cancel trigger** →
   confirm in MetaMask.
3. State badge → **CANCELLED**. If it was the pool's last active trigger, the "Watched pools" count
   on the Dashboard drops by one.

---

## Flow 6 — Error states you can trigger on purpose

| Do this | You see |
|---|---|
| Open `/triggers/new` with no wallet | "Connect a wallet to arm a trigger" |
| Switch MetaMask to another network | red **Wrong network** in the nav |
| Drag the threshold slider to its min/max | Arm button disabled |
| Advanced → Recurring, set cooldown below dwell | "cooldown must be ≥ dwell", Arm disabled |
| Open a one-sided market | gauge greys out — "One-sided book — no valid mid" |
| Set Min depth per side above what the market holds | G8 turns red; the trigger stays ARMED through fills |
| Watch a trigger while a short-window market recycles | state → **EXPIRED**, "pool recycled onto a new market" |

---

## If something looks wrong

| Symptom | Cause / fix |
|---|---|
| Dashboard stats stuck on "…" | Shannon public RPC rate-limited — refresh |
| Markets list empty | venue id moved — probability and triggers still work, only discovery is affected |
| **Simulate a trade** disabled or errors | `DEMO_TRADER_PRIVATE_KEY` missing from `web/.env.local`, or that key is out of STT/tUSDC |
| "no fill (touch moved)" | the order didn't cross — click the button again |
| Arm reverts `MarketNotTradable` | market finalized/emptied between read and send — pick another |
| Arm reverts `PoolTriggerLimit` | pool already has 16 triggers — pick another |
| Trigger → EXPIRED right after arming | short-window market recycled (nonce changed) — use a 24h market |

---

## Dev checks (optional, terminal)

```bash
cd contracts && forge test     # contract + Solidity parity tests
cd ../web && pnpm test         # TS probability port == Solidity, same fixtures
pnpm typecheck && pnpm build   # clean
```
