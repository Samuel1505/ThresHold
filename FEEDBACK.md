# Builder feedback — DreamDEX Event Contracts

Feedback from building **Threshold** (this repo) on top of DreamDEX binary Event Contracts + Somnia
Reactivity, during the hackathon. Everything below is something that cost us real time or that we
only found by reading contract/SDK source rather than docs.

We integrated at the contract level: the handler reads a `BinaryPool` directly from Solidity
(`getBookLevels`, `getBinaryPoolParams`, `marketNonce`, `finalized`, `booksEmpty`, `marketExpiryNs`)
inside a Reactivity callback, and the frontend reads the same functions via `eth_call`. So this is
feedback from someone who exercised the read side of the pool hard and the order-placement side
lightly (a demo taker + the bot-kit `ec-maker`).

Format: **[BUG]** = incorrect behaviour, **[DOCS]** = correct but undocumented / documented wrong,
**[DX]** = friction we think is worth smoothing.

---

## DreamDEX contracts & SDK

### 1. [DOCS] Pool recycling via `marketNonce` is the single biggest design surprise

`BinaryPool` addresses are **recycled** onto new markets — `PoolRecycled` re-points a pool at a fresh
market and increments `marketNonce()`. A subscription (or any cached pool address) outlives the
market it was created against.

This is only discoverable from a one-line comment in `readsAbi.js` (~L41) and the `PoolRecycled`
entry in `binaryPoolEventsAbi`. It is not in the rendered docs, and it is a correctness landmine for
**anyone** subscribing to pool events or caching a pool→market mapping: without pinning `marketNonce`
at bind time, an automation armed on the 14:00 BTC window silently fires on the 14:05 window's book.

**Ask:** put this front and centre in `docs/event-contracts.md` with the recommended pattern (read
`marketNonce()` at bind time, re-check on every callback, treat a mismatch as "market gone"). It's
the first thing an integrator needs to know and the last thing they find out.

### 2. [DOCS] The `oneCollateral` / decimals trap

`oneCollateral` is `1e6` on Shannon (TestUSDC, 6 dp) and `1e18` on mainnet (USDso). Every price and
quantity from the pool is a raw integer in these units. Hardcoding `1e18` (the natural default)
produces prices that are off by 12 orders of magnitude and gates that silently never pass.

We hit the downstream version of this: `minDepthPerSide` set in 18 dp against a 6 dp pool → gate
always fails, callback fires, nothing executes, no error. Cost an afternoon.

**Ask:** a prominent "decimals differ per chain — always read `oneCollateral` from
`getBinaryPoolParams()`, never assume 18" callout, plus a worked example in both.

### 3. [DOCS] The book is quoted in YES terms **on both legs** — source-only

`P(YES) = yesPrice / oneCollateral`, and a NO order's price is `oneCollateral - priceOwn`. The only
statement of this is a comment in `packages/ec-core/src/orders.ts` L114–116:

```ts
const priceYes = outcome === "YES" ? priceOwn : one - priceOwn;
```

For anyone computing a probability from the book this is *the* formula, and it's buried in a strategy
package. It belongs in the Event Contracts doc as a titled section.

### 4. [BUG/DOCS] `closingTop` — docs and SDK versions disagree

`docs/02` and multiple SDK references describe `closingTop(uint256 maxSteps) → (bestBid, bestAsk,
bidFound, askFound)` as available and cite `readsAbi.js` L58. It is **not in `@somnia-chain/markets-sdk@0.28.1`** —
it first appears in `0.29.0` (`readsAbi.ts` L61), and even there the comment restricts it to
"capture-generation pools only; older pools lack the selectors".

Meanwhile the ecosystem guidance (bot-kit, CLAUDE-style setup) says to pin `0.28.1` exactly because
`0.29.0` is untested against the kit. So the recommended SDK version and the documented read API are
inconsistent. We ended up deriving top-of-book and spread from `getBookLevels(isBid, 1)`, which works
on every pool generation but costs marginally more gas.

**Ask:** either backport `closingTop` to the pinned line, or document `getBookLevels(isBid, 1)` as
*the* supported way to get top-of-book and stop citing `closingTop` for `0.28.x`.

### 5. [BUG] SDK `placeOrder` resolves successfully even when the transaction reverted

From the bot-kit's own `packages/ec-core/src/inventory.ts`:

> NOTE the `assertTxOk`: the SDK resolves even when the tx REVERTED (it skips simulation and never
> checks `receipt.status`) — e.g. minting on a market that just left Trading. Without this the bot
> believes it holds inventory it doesn't.

We can confirm this. `trader.placeOrder(...)` / `mintSet(...)` return a receipt-shaped object with no
error on a reverted tx; you have to check `receipt.status === "reverted"` yourself. For a market that
recycles every few minutes this is easy to hit (place an order, market rolls, tx reverts, SDK says
fine). The SDK should either simulate first or reject on `status !== "success"` by default.

### 6. [DX] Self-matching forces a two-key setup for any local end-to-end test

`SELF_MATCHING_OPTION` means one key cannot be both the resting maker and the crossing taker — the
venue cancels one side. To demo "arm a trigger → a trade crosses → it fires" we needed a **separate
funded maker key** (we ran the bot-kit `ec-maker`) plus a taker key. This is correct venue behaviour,
but it's an unobvious prerequisite for anyone building an end-to-end test or demo, and it isn't
called out anywhere. A short "you need two keys to test a fill against your own liquidity" note in
the EC quickstart would save people the confusion.

### 7. [DOCS] `MarkPriceUpdated` is SpotPool-only — a tempting wrong assumption

`MarkPriceUpdated` is in `spotPoolEventsAbi`. Binary pools do **not** emit it. It's the obvious event
to subscribe to if you want "tell me when the price moved", and it silently never fires for binary
pools. The right wake-up event for binary pools is `OrderFilled`. Worth an explicit "binary pools
emit `OrderFilled`, not `MarkPriceUpdated`" line.

### 8. [DOCS] Verify `topic0` against a real log — the SDK carries a past-incident warning, make it louder

A comment in `perpPoolEventsAbi` notes that a previous ABI arity claim was wrong, which produced a
different `keccak256` signature hash, so `watchEvent` silently filtered on a `topic0` no pool ever
emitted — a callback that never fires with no error. We took this seriously and verified
`OrderFilled`'s topic0 against a real emitted log during setup
(`0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399` — correct), but a less
paranoid integrator would lose a day here. This deserves a prominent "always confirm event topic0
against a live log before trusting the ABI" note in the events section, not a buried comment.

### 9. [DX] Venue IDs move, and markets are split across many venues

- `VENUE_ID` changed **three times in the first week of August 2026** (noted in the bot-kit
  `.env.example` itself). Nothing that references a venue id by constant survives.
- On Shannon right now, event-contract series are spread across **~5 venues by duration** (1m, 15m,
  1h, 4h, 24h, 1080h are each on a *different* venue id). We initially scoped discovery to the one
  venue in the docs (`0x679795a0…`) and saw only the 4h/24h markets — the 45-day series
  (`0x09567c41…`) was invisible until we queried it explicitly.

**Ask:** a stable, documented way to enumerate "all live binary venues" (or one canonical venue that
carries every duration), and a changelog when venue ids move. Right now the working advice is "read
the venue id off a live market row and never trust a config file", which is not a great story for a
production integration.

### 10. [BUG/DX] The indexer (`dev.smk.somnia.host/v1/graphql`) times out under light load

`client.listBinaryMarkets(...)` and `client.getPortfolio(...)` intermittently fail with
`The operation was aborted due to timeout` (the SDK's `IndexerError` wrapping a fetch `TimeoutError`)
even for small queries, several times per hour, from two different networks. During our demo prep a
single `/api/markets` route that called `listBinaryMarkets` + `getMarketOnchain` per market hung long
enough to blank the page. We ended up dropping the indexer from discovery entirely and reading pool
state (`marketNonce`, `marketExpiryNs`, `finalized`) directly over RPC from a hardcoded market list.

The base GraphQL endpoint (`{ __typename }`) responds fine in ~0.4s — it's the heavier
market/portfolio queries that stall. Looks like a backend performance / timeout-tuning issue rather
than the endpoint being down.

### 11. [DX] REST (`stg.api.dreamdex.io/v0`) vs GraphQL (`dev.smk.somnia.host/v1/graphql`) — which is canonical?

The bot-kit core defaults to the REST API; `@somnia-chain/markets-sdk`'s `SomniaMarkets` client uses
the GraphQL indexer. Both are "the DreamDEX API". A newcomer can't tell which one to build against,
whether they're the same data, or which is supported. Some `stg.api.dreamdex.io/v0` paths 404
(`/health`, `/ec/markets`) while `/markets` works. One documented, canonical data API per environment
would help a lot.

### 12. [DX] The bot-kit README documents only the spot side

`https://github.com/somnia-chain/dreamdex-bot-kit` — the rendered README covers spot trading;
`packages/ec-core` and the six `ec-*` strategies (the entire Event Contracts half, and the actual
reference implementation for this hackathon) are in the tree but not in the README. The working
advice is "clone, don't browse GitHub". A README section pointing at `packages/ec-core` and
`docs/event-contracts.md` would fix this in five minutes.

### 13. [DX] Testnet liquidity and short recycle windows make Event Contracts hard to build against

Most binary markets on Shannon sit with empty or one-sided books, and the short-duration series
(1m–4h) recycle every few minutes — which is realistic but brutal for iterative development. A
trigger armed against a 4h window can `EXPIRE` on a nonce change before you finish testing it. We had
to run our own maker (`ec-maker`) to have anything to demo against, and eventually moved our demo to
the 1080h (~45-day) series specifically because it's the only one that won't recycle mid-session and
has a maintained ~50% book.

**Ask:** a couple of **long-lived, house-maintained** binary markets on testnet with a persistent
two-sided book, explicitly labelled "for integration testing". It would remove the single biggest
source of demo-day fragility.

---

## Somnia Reactivity (tightly coupled to the above)

### 14. [DX] `SUBSCRIPTION_OWNER_MINIMUM_BALANCE = 32 ether` on the *calling contract* is a real onboarding blocker

The 32 STT minimum is checked against the contract that calls `subscribe` / `scheduleSubscriptionAtTimestamp`,
not the EOA. That's a sensible anti-spam design, but the Shannon faucet
(`testnet.somnia.network`) caps well below 32 per claim, so bootstrapping a subscriber contract means
many faucet claims into an EOA and then a funding transfer. For a hackathon this is a first-hour
blocker. A faucet mode that funds a contract address to the subscription minimum, or a higher
per-claim cap, would help.

### 15. [DOCS] "Handler executes in the same block as the triggering event" is not verifiable from package source

This is claimed in the Somnia docs and is a great pitch line, but it can't be confirmed from
`@somnia-chain/reactivity-contracts`. In practice our executions land a few seconds later via the
scheduled tick, which is still keeper-free but not same-block. Either document the actual timing
guarantee precisely (event-driven latency vs scheduled-tick latency) or soften the claim.

### 16. [DX] Shannon's ~10× gas schedule breaks `forge script` and surprises `SSTORE` budgeting

- `forge script` assigns mainnet-like per-tx gas limits (~3.7M) for a multi-tx deploy → instant
  out-of-gas. Our 12.8 KB registry actually costs **~42.8M gas** to deploy on Shannon. We had to
  deploy each contract with `forge create` (whose `eth_estimateGas` is correct) and wire them with
  `cast send`.
- Everything must be deployed **`--legacy`** — EIP-1559 estimation produces a gas price under
  Shannon's 6 gwei basefee.
- A **cold `SSTORE` (0→nonzero) needs ~1.5M gas *available*** to succeed even though it only consumes
  ~220k. This blew our `actionGasCap` budgeting (had to raise 500k → 2M) and we added a 1-wei
  sentinel to our demo vault so the hot-slot write fits a modest cap. This gas-availability-vs-consumption
  gap is very non-obvious and should be documented for anyone sizing a callback gas budget.

### 17. [BUG] Public RPC drops CORS headers on rate-limited responses; some txs fail with an internal `.map` error

- `api.infra.testnet.somnia.network` rate-limits per client and returns the throttled response
  **without** `Access-Control-Allow-Origin`, so a browser reports it as a CORS failure rather than a
  429. Any dapp reading the chain directly from the browser hits this intermittently. We worked
  around it with a same-origin server proxy.
- Some `eth_sendTransaction` calls through MetaMask fail with
  `InternalRpcError: ... Cannot read properties of undefined (reading 'map')` — a JS error surfacing
  from the RPC/gateway layer, not a revert. The same transaction simulates and `eth_estimateGas`es
  fine, and a raw viem `sendTransaction` (EIP-1559 or legacy) succeeds. Looks like a bug in the
  gateway's handling of a specific request shape from MetaMask.
- Minor: `api.infra.testnet.somnia.network` vs `dream-rpc.somnia.network` — two RPC URLs in
  circulation (docs vs bot-kit defaults), unclear which is canonical / better maintained.

---

## What worked well

- **`getBookLevels` / `getBinaryPoolParams` from Solidity** — clean, cheap enough to run inside a
  Reactivity callback (16-level read + VWAP well under a 10M budget), and the return shapes are sane.
  This is the core thing we needed and it just worked.
- **`marketNonce()` / `finalized()` / `booksEmpty()` / `marketExpiryNs()`** — exactly the right set
  of liveness primitives, all view, all cheap. Once you know about recycling, `marketNonce` is a
  perfect market-identity check.
- **`scheduleSubscriptionAtTimestamp`** — behaved exactly as needed for our time-based fallback
  evaluation; the scheduled tick fired our first fully-autonomous execution.
- **`SomniaEventHandler` base** — the `onEvent`-restricted-to-`0x0100` pattern and ERC-165 check are
  a good, minimal safety baseline to build a handler on.
- **The bot-kit `ec-maker`** — once found, it ran a two-sided book on testnet for a 2h soak with zero
  errors and was the right reference for order placement.

---

## Summary of concrete asks

| # | Ask |
|---|---|
| 1 | Document pool recycling + `marketNonce` pinning prominently in `docs/event-contracts.md` |
| 2 | "Read `oneCollateral` from the pool, decimals differ per chain" callout with worked examples |
| 3 | Titled section: "the book is quoted in YES terms on both legs", with the formula |
| 4 | Resolve the `closingTop` version mismatch — backport it or bless `getBookLevels(isBid,1)` |
| 5 | Make SDK `placeOrder`/`mintSet` reject on `receipt.status !== "success"` |
| 8 | Prominent "verify event topic0 against a live log" note in the events docs |
| 9 | A stable way to enumerate all live binary venues; changelog when venue ids move |
| 10 | Fix the indexer timeouts on `listBinaryMarkets` / `getPortfolio` |
| 11 | One canonical, documented data API per environment (REST or GraphQL, not both) |
| 12 | bot-kit README section pointing at `packages/ec-core` for Event Contracts |
| 13 | A few long-lived, house-maintained testnet markets labelled "for integration testing" |
| 14 | Faucet path to fund a contract to the 32-STT subscription minimum |
| 16 | Document Shannon's gas schedule + the cold-`SSTORE` availability gap for callback budgeting |
| 17 | RPC: send CORS headers on rate-limited responses; investigate the MetaMask `.map` failure |
