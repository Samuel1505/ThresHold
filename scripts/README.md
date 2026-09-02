# @threshold/scripts

PHASE 0 verification harness (docs/16, docs/PHASE0-RUNBOOK.md) and later
deployment/demo scripts. Reads the repo-root `.env`.

| Script | Task | Needs a key? | Status |
|---|---|---|---|
| `pnpm discover`  | 0.3 — list live binary markets, resolve pool/nonce/status on-chain, print `.env` targets | no | ✅ verified 2026-09-02 |
| `pnpm poolreads` | 0.4 — decode `getBinaryPoolParams` / `getBookLevels` / gates reads, derive P(YES) | no | ✅ verified 2026-09-02 |
| `pnpm topic0`    | 0.5 — compare `OrderFilled` topic0 to a **real** emitted log (skips other event types) | no | ⏳ needs a live fill (run after `cross`) |
| `pnpm cross`     | 0.6 / 0.7 — place a crossing IOC, prove the callback fires, compare fill vs callback block | yes (`DEMO_TRADER_PRIVATE_KEY`) + a two-sided book | ⏳ blocked on 0.1/0.2 |

Common overrides: `TARGET_POOL`, `TARGET_MARKET_ID`, `VENUE_ID`, `MIN_MINS_LEFT`
(discover), `SCAN_BLOCKS` (topic0), `CROSS_SIZE` / `SUBSCRIBER_ADDRESS` (cross).

## Key facts pinned in `src/env.ts`

- SDK **`@somnia-chain/markets-sdk@0.28.1`** exact. `SomniaMarkets` class (no `createClient`
  in this version); `.client` = reads, `.trader` = writes.
- `closingTop` is 0.29.0-only — **not used**; top-of-book from `getBookLevels(isBid, 1)`.
- `ORDER_FILLED_TOPIC0 = 0xc87f4223…261a399`. Verified == `keccak256` of the signature;
  live-log check pending a real fill.
- Shannon: RPC `api.infra.testnet.somnia.network`, chain 50312, indexer (GraphQL)
  `dev.smk.somnia.host/v1/graphql`.
