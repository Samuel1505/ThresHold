# 09 — Frontend

## Stack

| Choice | Why |
|---|---|
| Next.js 14 App Router + TypeScript | Zero-config deploy to Vercel; the demo needs a public URL |
| wagmi v2 + viem v2 | viem is already the SDK's dependency — one client stack, no adapter layer |
| Tailwind CSS | Fast, no runtime, no theme system to debug at 3am |
| TanStack Query | wagmi v2 uses it already; polling and cache invalidation for free |
| Recharts | Only for the probability sparkline. Nothing heavier |

**Do not add:** Redux, a component library, a design system, framer-motion beyond one CSS keyframe,
or a backend. Every one of these has cost teams a demo.

## Chain config

```ts
export const somniaShannon = defineChain({
  id: 50312,
  name: "Somnia Shannon",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL!] } },
  blockExplorers: { default: { name: "Shannon Explorer", url: process.env.NEXT_PUBLIC_EXPLORER_URL! } },
});
```
`NEEDS VERIFICATION` — public RPC and explorer URLs from https://docs.somnia.network.

## Routes

| Route | Purpose |
|---|---|
| `/` | Dashboard |
| `/markets` | Market list |
| `/markets/[marketId]` | Market detail + book |
| `/triggers/new?market=` | Trigger builder |
| `/triggers` | Active triggers |
| `/triggers/[id]` | Trigger detail — the belief→threshold→action view |
| `/demo` | Scripted demo page |
| `/docs` | How it works |

## Components

| Component | Notes |
|---|---|
| `ProbabilityGauge` | Arc 0–100%. Threshold marker. Greys out when gates fail |
| `GateChecklist` | **The most important component.** G1–G8 live pass/fail with reasons |
| `OrderBookTable` | 8 levels/side from `getBookLevels` |
| `DepthChart` | Cumulative notional with the `minDepthPerSide` line overlaid |
| `ThresholdSlider` | Over a live probability sparkline |
| `DwellSelector` | 5s / 30s / 60s / custom |
| `ActionSelector` | Allow-listed actions only |
| `TriggerPreview` | "Would this fire right now?" + which gate blocks it |
| `TriggerCard` | State badge, live probability vs threshold |
| `DwellProgressRing` | Countdown while OBSERVING |
| `ExecutionCard` | **Fill block and action block side by side** |
| `SubscriptionBalanceBanner` | Warns below ~35 STT |
| `NetworkGuard` | Wraps every write path |
| `BeliefToActionFlow` | The three-panel animated view on Trigger Detail |

## The rule that governs all data fetching

> **Probability shown in the UI is computed from the same on-chain reads the handler uses. Never from
> the REST indexer.**

```ts
// lib/probability.ts — a TypeScript port of ProbabilityLib, kept behaviourally identical.
export function depthWeightedBps(snap: PoolSnapshot): number
export function evaluateGates(snap: PoolSnapshot, cfg: TriggerConfig): GateResult[]
```

Use `multicall` to batch `marketNonce`, `finalized`, `booksEmpty`, `marketExpiryNs`,
`getBinaryPoolParams`, `closingTop`, and both `getBookLevels` calls into one round trip. Poll every
2s on market/trigger detail pages; use `watchContractEvent` for `TriggerStateChanged` and
`TriggerExecuted`.

The REST/WS indexer is for **market discovery and display metadata only**.

**Port parity is a test, not a hope.** `12` requires a fixture-based test asserting the TS port and
the Solidity library return identical bps for the same book. If they drift, the preview lies to the
user about whether their trigger will fire.

## Design direction

Dark, instrument-panel aesthetic — this is a control surface, not a trading app. One accent color for
"armed", one for "qualified", one for "executed". Monospace for all numbers. No gradients, no glass.

The animated pulse on execution is the only motion in the app, which is what makes it read as
significant on video.

---

## As built (PHASE 6 + 7, 2026-09-03)

`web/` — Next 14 App Router, wagmi v2 / viem v2, Tailwind, TanStack Query. Hand-rolled, no
component library, no `create-next-app`. All routes from the table above; `next build` green.

- **`lib/probability.ts`** is the bigint TS port of `ProbabilityLib.sol`. Parity is enforced by a
  matched pair of tests — `web/lib/probability.test.ts` (vitest) and
  `contracts/test/parity/Parity.t.sol` — asserting identical outputs for identical fixtures. **This
  resolves P1/P2.**
- **`hooks/usePoolSnapshot`** multicalls `getBinaryPoolParams` / `marketNonce` / `finalized` /
  `marketExpiryNs` / `getBookLevels(true,8)` / `getBookLevels(false,8)` and runs the port. It is the
  only probability source in the UI. Polls 2s.
- **Market discovery** is the one indexer touch — `app/api/markets/route.ts`, server-side SDK call,
  5s in-memory cache, market metadata + `getMarketOnchain` (pool/nonce/status/expiry) only. The
  `@somnia-chain/markets-sdk` never reaches the browser bundle.
- **`GateChecklist`** (`lib/probability.ts` `evaluateGates`) renders G1–G8 + the threshold check
  live against the current book on the builder and the trigger/market detail pages.
- Live feeds via `watchContractEvent` (`useTriggerFeed`, `useExecutions`), never `getLogs` polling
  for state.
- Design: IBM Plex Sans/Mono, layered near-black surfaces, hairline seams, `tabular-nums`
  everywhere, one accent per trigger state, the execution pulse (`.pulse-track` in `globals.css`)
  as the only motion, `prefers-reduced-motion` honoured. No gradients, no glass, no emoji.
