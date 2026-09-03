# Test the app

Everything is in the browser. No terminal. The app runs against the live Shannon deployment
(Registry `0xb31014A9…`, Handler `0x693DC66E…`, DemoVault `0xcAc26cFD…`).

**How a trigger fires:** a trader fills an order on the market → Somnia's reactivity precompile
calls the handler → the handler checks the gates + dwell → it calls the target. No keeper, no
backend, nobody presses a "fire" button. In real use the market produces the fill on its own; for
a demo there's a **Simulate a trade** button so you don't have to wait.

---

## Start it

```bash
cd web
pnpm install
cp ../.env.example .env.local
pnpm dev
```

Open **http://localhost:3000**.

> For the **Simulate a trade** button, also add one line to `web/.env.local`:
> `DEMO_TRADER_PRIVATE_KEY=0x…` — a throwaway key with STT + tUSDC. Skip it and the button is
> disabled; everything else still works (you just wait for real market fills).

## Wallet

Add to MetaMask → get ~1 STT from https://testnet.somnia.network/

| | |
|---|---|
| RPC | `https://api.infra.testnet.somnia.network` |
| Chain ID | `50312` |
| Symbol | `STT` |

---

## 1 · Look around (no wallet)

| Open | You see |
|---|---|
| **`/`** | Registry balance, live market count. A red/amber banner if the subscription balance is low (it's real). |
| **`/markets`** | BTC/ETH markets. The **P(YES)** column ticks — computed from the order book on every poll, not from any API. |
| **a 24h market** | Gauge with live P(YES) · order book · depth chart · **Gate check**: G1–G8 all green with live reasons. |
| **`/demo`** | DemoVault balances + a live execution stream. |
| **`/docs`** | The mechanism, the gates, the deployed contracts. |

---

## 2 · Arm a trigger

1. **`/markets`** → open a **24h** market (longest runway).
2. Note the **P(YES)** on the gauge — say **62%**.
3. **Connect wallet** (top right) → approve → switch to Shannon if asked.
4. **Arm a trigger →**
5. Set:

| Field | Value |
|---|---|
| Threshold | `50%` (below current P(YES) so it qualifies) |
| Direction | Rises above |
| Dwell | `5s` |
| Action | `DemoVault.derisk()` |

6. Right panel: **"Would this fire right now? — yes"**, all gates green.
7. **Arm — 50% above · hold 5s** → confirm in wallet (one transaction).
8. **"Trigger #N is armed"** → **Watch it →**

You're on `/triggers/N`. State: **ARMED**. This page auto-refreshes.

---

## 3 · See it fire

**In the browser.** On the trigger page, right column: **"Waiting for a fill on this pool"** →
click **Simulate a trade →**.

That places one crossing order on the market (server-side, you sign nothing). Watch the trigger:

```
ARMED  →  OBSERVING   (dwell ring counts 5s)  →  EXECUTED   (green pulse across the panel)
```

Then:

| Where | What |
|---|---|
| **BeliefToActionFlow** | target panel flips: DemoVault `risky → 0`, `safe → +0.1` |
| **ExecutionCard** appears | fill block + action block, side by side |
| **Timeline** | `dwell started` → `armed → observing` → `executed at 6X% · action succeeded` |
| **`/demo`** | same execution shows in the live stream |

If it doesn't move in ~15s, click **Simulate a trade** again (a maker may have moved the touch —
it tells you "no fill (touch moved) — try again").

> **In real use you skip step 3 entirely.** You arm the trigger and leave. It fires when the market
> actually crosses your threshold and holds — the `Simulate a trade` button is only so you don't
> wait around during a test.

---

## 4 · Verify it was autonomous

Click the execution tx in the **ExecutionCard** → explorer:

- **`from`** = the **Registry** contract (not you, not a bot) — the precompile scheduled it.
- The fill tx: `from` = the trader, `to` = the **pool**. **Nothing was ever sent to the vault.**

---

## 5 · Cancel

1. Arm another trigger.
2. On its page, while **ARMED**/**OBSERVING** → **Cancel trigger** → confirm.
3. State → **CANCELLED**. If it was the pool's last trigger, "watched pools" on the dashboard drops.

---

## 6 · Error states to check

| Do | See |
|---|---|
| Disconnect wallet on the builder | "Connect a wallet to arm a trigger" |
| Switch MetaMask to another network | red **Wrong network** in the nav |
| Threshold slider to `0%` / `100%` | Arm disabled |
| Advanced → recurring, cooldown < dwell | "cooldown must be ≥ dwell", disabled |
| Open a one-sided market | gauge greys, "no asks — one-sided" on G6 |
| Min depth `10`, market has < 10 tUSDC/side | G8 red: "bid 4.2 < 10.0 required" — trigger stays ARMED through fills |
| Watch a trigger while a short-window market recycles | state → **EXPIRED**, "pool recycled onto a new market" |

---

## 7 · Dev checks (optional, terminal)

```bash
cd contracts && forge test          # 73 pass (incl. Solidity side of the parity contract)
cd ../web && pnpm test              # 6 pass — TS probability port == Solidity, same fixtures
pnpm typecheck && pnpm build        # clean
```

---

## If something's off

| Symptom | Cause / fix |
|---|---|
| Dashboard stats stuck on "…" | Shannon public RPC rate-limited — refresh |
| Markets list empty | venue id moved — probability & triggers still work, only discovery is affected |
| **Simulate a trade** disabled or errors | `DEMO_TRADER_PRIVATE_KEY` missing from `web/.env.local`, or that key is out of STT/tUSDC |
| "no fill (touch moved)" | the order didn't cross — click again |
| Arm reverts `MarketNotTradable` | market finalized/emptied between read and send — pick another |
| Arm reverts `PoolTriggerLimit` | pool already has 16 triggers — pick another |
| Trigger → EXPIRED right after arming | short-window market recycled (nonce changed) — use a 24h market |
