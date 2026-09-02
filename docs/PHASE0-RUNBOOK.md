# PHASE 0 Runbook

The gate before any product code (docs/16). Verifies the assumptions that can kill
Threshold: 32 STT on a subscriber contract, and a Reactivity callback firing on a
BinaryPool `OrderFilled`.

> ✅ **PHASE 0 COMPLETE (2026-09-02) — all of 0.1–0.7 pass, callback lands in the SAME
> block as the fill.** Full results in `docs/02` → `# PHASE 0 RESULTS`. This runbook is
> kept for reproducing the checks against a fresh market/deploy.

## Prereqs

```bash
pnpm install
cp .env.example .env          # fill DEPLOYER_PRIVATE_KEY, DEMO_TRADER_PRIVATE_KEY
(cd contracts && forge build) # vendored somnia-reactivity @ lib/somnia-reactivity
```

`DEMO_TRADER_PRIVATE_KEY` **must differ** from any maker key — DreamDEX blocks self-matching.

---

## 0.1 — Obtain 32 STT  (BLOCKER-1)

The registry / subscriber contract needs `>= 32 STT` (`SUBSCRIPTION_OWNER_MINIMUM_BALANCE`,
checked against the *calling contract's* balance — verified in `SomniaExtensions.sol`).

- Faucet: <https://testnet.somnia.network/> and the Google Cloud web3 faucet
  <https://cloud.google.com/application/web3/faucet/somnia/shannon>. Claim repeatedly into your EOA.
- If the faucet caps below 32: ask in the hackathon Telegram (`https://t.me/+XHq0F0JXMyhmMzM0`) —
  a standard request, sponsors normally grant it.
- If still blocked: switch to the last-resort tier (docs/05 §Last-resort) and state it plainly
  in the README. Do not hide it.

```bash
cast balance <YOUR_EOA> --rpc-url $SOMNIA_SHANNON_RPC   # need > 33e18 (32 + gas + demo)
```

---

## 0.2 — A contract can hold 32 STT and subscribe

```bash
cd contracts
forge script script/phase0/DeployMinimalSubscriber.s.sol \
  --rpc-url $SOMNIA_SHANNON_RPC --private-key $DEPLOYER_PRIVATE_KEY --broadcast
# note the address -> put it in .env as SUBSCRIBER_ADDRESS

cast send $SUBSCRIBER_ADDRESS --value 32ether \
  --rpc-url $SOMNIA_SHANNON_RPC --private-key $DEPLOYER_PRIVATE_KEY
cast balance $SUBSCRIBER_ADDRESS --rpc-url $SOMNIA_SHANNON_RPC   # must be >= 32e18
```

The actual `subscribe` call happens in 0.6. If it reverts `InsufficientBalance()` the
balance check above lied — re-fund. Any other revert: decode against `SomniaExtensions` errors.

---

## 0.3 — Find a live binary market   ✅ (verified 2026-09-02, no key needed)

```bash
pnpm phase0:discover
```

Lists Trading binary markets, resolves each on-chain (`getMarketOnchain` → pool, nonce,
status, expiry), and prints the `.env` lines for the freshest one. Copy
`TARGET_MARKET_ID` / `TARGET_POOL` / `VENUE_ID` into `.env`.

> The indexer's `status:"Trading"` filter lags and returns stale rows — the script
> filters to on-chain `status == Trading && !finalized && expiry > now`. Live markets
> span ~5 venues on Shannon; set `VENUE_ID` to scope. Prefer a **24h** series for the
> demo — hours of runway vs. 38 min for the 4h series.

---

## 0.4 — Pool reads work   ✅ (verified 2026-09-02, no key needed)

```bash
TARGET_POOL=0x... pnpm phase0:poolreads
```

Confirms `getBinaryPoolParams` (15-field tuple), `getBookLevels`, `marketNonce`,
`finalized`, `booksEmpty`, `marketExpiryNs` decode with the `markets-sdk@0.28.1` ABI,
`oneCollateral == 1e6`, and derives a live P(YES) on-chain.

> `closingTop` is **0.29.0-only** and not used — top-of-book comes from
> `getBookLevels(isBid, 1)` (docs/07 §2 fallback). See `docs/02` PHASE 0 RESULTS.

---

## 0.5 — `topic0` is real

```bash
TARGET_POOL=0x... pnpm phase0:topic0
```

`keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)")`
`= 0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399` — already matches
the local signature hash. The script then scans pool history and watches for a **real
`OrderFilled`** log (it identifies and skips `OrderPlaced`/`OrderCancelled`/etc.) and
compares. Exit 0 = confirmed; exit 2 = inconclusive (nothing crossed — run 0.6 first);
exit 1 = the SDK arity bug reproduced (update the constant in `env.ts` **and**
`MinimalSubscriber.sol`).

---

## 0.6 — Callback fires  +  0.7 — same block?

Needs a two-sided book. Seed one with the bot-kit maker in a separate shell:

```bash
git clone --depth 1 https://github.com/somnia-chain/dreamdex-bot-kit.git
cd dreamdex-bot-kit && npm install
# .env: NETWORK=testnet, PRIVATE_KEY=<a THIRD key, not deployer/taker>, VENUE_ID=<from 0.3>, DRY_RUN=false
STRATEGY=ec-maker npm start -w ec-maker
```

Subscribe the harness, then cross:

```bash
cast send $SUBSCRIBER_ADDRESS "subscribeToPool(address,bytes32)" \
  $TARGET_POOL 0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399 \
  --rpc-url $SOMNIA_SHANNON_RPC --private-key $DEPLOYER_PRIVATE_KEY
cast call $SUBSCRIBER_ADDRESS "lastSubscriptionId()(uint256)" --rpc-url $SOMNIA_SHANNON_RPC  # != 0

pnpm phase0:cross
```

`06-crossing-order.ts` places a crossing IOC, prints the fill block, then polls
`MinimalSubscriber.callbackCount()`:

- **0.6 gate:** `callbackCount` increments → the precompile invoked the handler.
- **0.7 result:** prints `fill block` vs `callback block`.
  - same → the "same block as the fill" pitch holds.
  - different → **not fatal**; change wording everywhere to "automatically, no keeper".

If no callback in 60s, work through `docs/18` → Reactivity → "Callback never fires".

---

## Gate

**0.1, 0.2, 0.5, 0.6 must pass.** If 0.1/0.2 fail and the Telegram ask fails → last-resort
tier; update `00`, `05`, `15`, README. Then delete `src/phase0/`, `script/phase0/`,
`test/phase0/` and start PHASE 1.
