# 06 — DreamDEX Integration

## Install — pin exactly

```bash
npm install @somnia-chain/markets-sdk@0.28.1   # NOT ^0.28.1
```

The bot kit pins `^0.28.1` and was written and tested against `0.28.x`. npm latest is **0.29.0,
published 2026-09-01**. A caret range pulls an untested minor into your build. Pin exact; upgrade
deliberately if at all.

## Reference implementation to copy from

```bash
git clone --depth 1 https://github.com/somnia-chain/dreamdex-bot-kit.git
```

`packages/ec-core/` is the correct reference for market discovery, order placement, and the SDK's
sharp edges. **Read `docs/event-contracts.md` in full before writing integration code.** Also present:
`skills/` (Agent Skills for Claude Code covering Somnia + dreamdex-bot) — load these.

Note the repo's rendered README documents only the *spot* side; the EC half
(`packages/ec-core`, six `ec-*` strategies) is in the tree but not in the README. Clone, don't browse.

## Configuration

```ts
import { SomniaMarkets } from "@somnia-chain/markets-sdk";

const CORE = {
  binaryModule:         "0x3ecC694Cef705358864a646142ac17A90E29e388",
  marketsCore:          "0x2802504314685D89bF6C992CA5a8e7cC78bc0294",
  clobFactory:          "0xb2BE8EE02F96379DB75f01802384593EBa9bfF04",
  binaryPoolImpl:       "0x82A1FcdaA2daC2fC7D5f9909D43E68021eE966FD",
  binarySettlement:     "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23",
  collateralRouter:     "0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C",
  marketCreatorFactory: "0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B",
  oracleHub:            "0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b",
} as const;

const TESTNET = {
  chainId: 50312,
  decimals: 6,
  addresses: {
    ...CORE,
    collateral:    "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E", // TestUSDC, public faucet(uint256)
    testUsdc:      "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E",
    marketCreator: "0x5Ce69567dB39C8fBAd7e048bEfdbcCdfE67B44e6", // venue 2 — the live one
  },
};
```

`VENUE_ID` must come from `.env` and be read off a live market row. Venue IDs changed three times in
the first week of August 2026.

## What Threshold actually uses

| Feature | Used for | Layer |
|---|---|---|
| `client.listBinaryMarkets({ venueId, status })` | Market discovery for the UI | off-chain |
| `getBinaryPoolParams()` | `oneCollateral`, `market`, `marketNonce`, `finalized` | **on-chain** |
| `getBookLevels(isBid, numLevels)` | Depth-weighted probability | **on-chain** |
| `closingTop(maxSteps)` | Best bid/ask, spread | **on-chain** |
| `marketNonce()` | Gate G2 — recycle protection | **on-chain** |
| `finalized()`, `booksEmpty()`, `marketExpiryNs()` | Validity gates | **on-chain** |
| `OrderFilled` event | Reactivity wake-up | **on-chain** |
| `ec-core` `placeLimit` | **Demo only** — moving the market on camera | off-chain |

This is a meaningful integration, not a link: Threshold reads DreamDEX's order book directly from
Solidity and derives its signal from live book state.

## Market discovery

```ts
const markets = await client.listBinaryMarkets({ venueId, status: "Trading" });
// Each row: marketId, symbol, asset, strike, intervalSec, expiry, venueId, operatorId, pool address
```

Rules:
- Gate trading eligibility on the **on-chain** status, not the indexer's — the indexer lags by seconds.
- Never parse the human-readable question text; its wording has changed several times. Use `asset`,
  `strike`, `intervalSec`.
- Key everything by `marketId`/symbol, **never** by pool address — pools are recycled.
- For settled markets use `listBinaryMarkets({ status: "Finalized" })`; `loadMarkets()` drops them.

## Demo-side order placement

Use `ec-core`'s `placeLimit`, **not** the SDK's unified `createOrder`.

`createOrder` does `parseUnits(price.toFixed(18), 18)`. `(0.05).toFixed(18)` is
`"0.050000000000000003"` — three wei off the tick grid, rejected as `InvalidPrice`. On mainnet only
`0.25`, `0.5` and `0.75` survive of fifteen ordinary probabilities. **Shannon is 6-dp so this is
invisible there** — you can ship something that only breaks in production. Use `placeLimit`.

Always wrap writes in `ec-core`'s `assertTxOk`: SDK writes skip simulation and resolve even on
revert, so an underfunded demo bot fails silently.

Scope `fetchOpenOrders()` by symbol — unscoped it reaches across binary, spot and perp for the whole
wallet, and shared-key cleanup will cancel orders you did not place.

## Probability, restated

The book is quoted **in YES terms on both legs** (`ec-core/src/orders.ts` L114–116). So
`P(YES) = yesPrice / oneCollateral`, and `oneCollateral` is read from the pool — `1e6` on Shannon,
`1e18` on mainnet. Never hardcode.
