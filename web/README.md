# @threshold/web

Next.js 14 · wagmi v2 / viem v2 · Tailwind · TanStack Query. No component library, no backend.

The one rule (docs/03, docs/09): **probability is computed from the same on-chain reads the
handler uses** — `getBinaryPoolParams` / `getBookLevels` / `marketNonce` via multicall, run
through `lib/probability.ts`, a behaviourally-identical port of `ProbabilityLib.sol`. Never the
REST indexer. Parity is a test: `pnpm test` (mirrors `contracts/test/parity/Parity.t.sol`).

The indexer (`@somnia-chain/markets-sdk`) is used **only** for market discovery, server-side, in
`app/api/markets/route.ts` (5s cache). Everything that decides state is `eth_call` / `watchContractEvent`.

```bash
pnpm install
cp ../.env.example .env.local     # NEXT_PUBLIC_* only; addresses default to the live deploy
pnpm dev                          # http://localhost:3000
pnpm test && pnpm typecheck && pnpm build
```

## Routes
`/` dashboard · `/markets` + `/markets/[id]` · `/triggers` + `/triggers/new?market=` + `/triggers/[id]`
· `/demo` (scripted for recording) · `/docs`

## Design
Dark instrument panel. Layered near-black surfaces, hairline seams (not shadows), monospace tabular
numbers, one accent per trigger state (armed blue / observing amber / executed green / failed red).
Motion only where it communicates — the execution pulse is the one deliberate animation;
`prefers-reduced-motion` is respected. Tokens: `app/globals.css`.
