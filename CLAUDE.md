# CLAUDE.md — instructions for Claude Code

## Project mission
Build **Threshold**: a probabilistic automation layer for DreamDEX Event Contracts on Somnia Shannon
testnet. A smart contract executes an action when a binary market's depth-weighted probability crosses
a threshold and holds there. No keeper, ever.

Read `/docs` in numeric order before writing code. `docs/16` is the master plan.

## The rule above all others
**PHASE 0 in `docs/16` must complete before production code is written.** It verifies the two things
that can kill this project: obtaining 32 STT for the subscriber contract, and the Reactivity callback
actually firing on a BinaryPool `OrderFilled`. Report results. Do not proceed on an unverified
assumption.

## Don't invent APIs
Every DreamDEX and Somnia capability used here was verified by extracting
`@somnia-chain/markets-sdk@0.28.1` and `@somnia-chain/reactivity-contracts@0.2.1`. If a function is
not in those extracted ABIs or in `docs/02`, **it does not exist**. Say so rather than writing hopeful
code. Uncertainty is marked `CONFIRMED` / `NEEDS VERIFICATION` / `ASSUMPTION` / `FALLBACK` / `BLOCKER`
— preserve those markers when you update the docs.

## Verify external dependencies
- Extract and read package source. Don't trust package READMEs, including the bot kit's — its rendered
  README documents only the spot side and omits the entire Event Contracts half.
- Pin `@somnia-chain/markets-sdk@0.28.1` **exactly**. npm latest is 0.29.0 and the kit was tested
  against 0.28.x.
- Reconcile against `https://docs.dreamdex.io/developers/event-contracts` and
  `https://docs.somnia.network/developer/reactivity`. Note any drift in `docs/02`.

## Architecture rules
1. On-chain is the only authority. No off-chain component may cause or prevent an execution.
2. The frontend computes probability from the same on-chain reads as the handler. Never from the REST
   indexer — it lags by seconds.
3. No backend, no database, no indexer, no keeper.
4. The event payload is a **wake-up only**. Never use `fillPrice` as the signal; re-read the book.
5. Pin `marketNonce` at arm time. Pools are recycled across markets.

## Technology rules
Solidity `0.8.30` (matches the reactivity package). Foundry. Next.js 14 + TypeScript + wagmi v2 +
viem v2 + Tailwind. No Redux, no component library, no extra frameworks.

## Coding rules
- Custom errors, not revert strings.
- Effects before interactions, always.
- Named constants; no magic numbers.
- Emit an event on every `_onEvent` entry — silent callback failures are otherwise undiagnosable.
- All fixed-point in basis points of `oneCollateral`. **Read `oneCollateral` from the pool**; it is
  `1e6` on Shannon and `1e18` on mainnet.

## Security rules
- `call` only. Never `delegatecall`. No value with the action call.
- `(target, selector)` allow-list, admin-curated. Deny the registry, handler, precompile, zero address.
- Cap action gas at 500k. Bound the per-pool trigger loop at 16.
- `try/catch` per trigger — one bad trigger must not block the other fifteen.
- Re-validate every gate at dispatch time, not only at dwell start.
- The security invariants I1–I10 in `docs/11` are the contract. Every one has a test in `docs/12`.

## Test after every major change
`forge test` after every contract change. The adversarial tests A1, A4, A6, A7 are the ones that
prove the design is real — they are not optional.

## Don't break working components
After PHASE 5 the project is submittable. Do not refactor working contracts to make the frontend
tidier. If something works on Shannon, leave it alone.

## Prefer simple MVP implementations
`maxLevels = 8`. One subscription per pool. One demo action. No TWAP, no EMA, no volatility model.
Depth-weighted mid plus dwell is sufficient and defensible.

## Keep on-chain/off-chain responsibilities clear
On-chain: trigger state, probability, gates, execution. Off-chain: discovery, display, preview.
The TS probability port must pass parity tests against the Solidity library (P1, P2). If they drift,
the UI lies to the user about whether their trigger will fire.

## Never expose secrets
`.env` gitignored. `.env.example` placeholders only. Never prefix a key with `NEXT_PUBLIC_`.
Throwaway keys with testnet funds only.

## Definition of done
1. PHASE 0 verified and results written into `docs/02`.
2. All U / I / A / P tests pass; I5 measures < 10M gas for 16 triggers.
3. Deployed to Shannon; a real `TriggerExecuted` log exists with no manual transaction to the target.
4. Frontend deployed; all seven MVP criteria in `docs/01` pass in a browser.
5. Two consecutive clean end-to-end demo runs.
6. README accurate, including limitations. Any unresolved `NEEDS VERIFICATION` disclosed, not hidden.
