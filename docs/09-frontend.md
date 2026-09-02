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
