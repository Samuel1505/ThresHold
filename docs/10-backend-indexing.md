# 10 — Backend & Indexing

## Decision: **no backend, no database, no indexer.**

Build none of it. Justification:

| Need | Solved by |
|---|---|
| Market discovery | `client.listBinaryMarkets()` — a client-side SDK call |
| Live probability | `eth_call` multicall against the pool |
| Trigger list/state | Registry view functions |
| Execution history | `TriggerExecuted` logs via `getLogs` |
| Live updates | `watchContractEvent` over the public RPC |

Everything is already on-chain or in the SDK. A backend would add deployment surface, a secrets
story, a failure mode during the demo, and a component a judge could reasonably ask "why does this
need to be trusted?" — for zero capability gain.

## What you would be tempted to build, and why not

**A trigger-state cache.** The registry already stores state; reading it is one multicall.

**A probability history service.** Keep the last N samples in React state, seeded from
`TriggerStateChanged` logs. History across page reloads is not worth a database in a six-day build.

**A keeper.** If you build one, the product's central claim is false. The only circumstance in which
a keeper is acceptable is the last-resort tier in `05`, and it must be disclosed in the README and
the demo.

## Hard rule

> **The backend is never the authority on whether a trigger executed.**

`TriggerExecuted` on-chain is the sole source of truth. If you later add caching, it must be
invalidated by chain events and must never be read on a path that decides UI state for execution.

## If a caching layer becomes genuinely necessary

Only if public-RPC rate limits break the demo. In that case: a single Next.js route handler
(`/api/markets`) that proxies `listBinaryMarkets` with a 5-second in-memory cache. No database, no
separate service, and **market metadata only — never probability, never trigger state.**
