# 18 — Troubleshooting

## Reactivity

### Callback never fires
**Symptom:** fills happen; the handler emits nothing.
**Causes, in order of likelihood:**
1. **Wrong `topic0`.** The SDK documents a past incident where a wrong ABI arity produced a different
   `topic0` and `watchEvent` silently filtered on something no pool ever emitted.
   → Take a real `OrderFilled` log, hash its signature, compare. See PHASE 0.5.
2. Wrong `emitter` — subscribed to the market or module address rather than the **pool**.
3. Subscription never created — `poolSubscriptionId[pool] == 0`.
4. Registry balance fell below 32 STT after subscribing.
5. Handler fails ERC-165 — `supportsInterface` broken by an override.

**Diagnosis:** `cast call $REGISTRY "poolSubscriptionId(address)(uint256)" $POOL`, then
`getSubscriptionInfo(subId)` on the precompile. Emit an event on **every** `_onEvent` entry before
any logic — without it this is undiagnosable.

### `InsufficientBalance()` on subscribe
The **calling contract** is below `32 ether`. Not the EOA. Fund the registry directly.

### `InvalidMaxFeePerGas()`
`maxFeePerGas < priorityFeePerGas + 6 gwei`.

### `GasLimitExceeded()`
`gasLimit > 200_000_000`.

### Callback fires but nothing executes
Add a `GateFailed(triggerId, gateId)` event and read the logs. Most common: G8 depth, because
`minDepthPerSide` was set in the wrong decimals (Shannon is **6**, not 18).

### Callback runs out of gas
Reduce `maxLevels`, reduce `MAX_TRIGGERS_PER_POOL`, or raise `SUBSCRIPTION_GAS_LIMIT` toward 200M.
Measure with test I5 rather than guessing.

## DreamDEX

### No live markets returned
Wrong `VENUE_ID` — they moved three times in early August. Query without a venue filter, read
`venueId` off the first live row, and set it from that.

### `InvalidPrice` on order placement
The 18-decimal bug: `parseUnits(price.toFixed(18), 18)` produces an off-grid value.
**Use `placeLimit` from `ec-core`, not the SDK's `createOrder`.** Invisible on Shannon's 6-dp venue,
fatal on mainnet.

### Transaction "succeeds" but nothing changed
SDK writes skip simulation and resolve even on revert. Wrap everything in `assertTxOk`.

### `loadMarkets()` doesn't find a settled market
Expected. Use `listBinaryMarkets({ venueId, status: "Finalized" })`.

### Probability differs between UI and handler
The UI is reading the REST indexer, which lags the chain by seconds. It must use `eth_call`. If both
read on-chain and still differ, the TS port has drifted — run parity tests P1/P2.

### Trigger went `EXPIRED` unexpectedly
The pool was recycled onto a new market and `marketNonce` no longer matches the pinned value. Correct
behaviour. Create a new trigger.

## Frontend

### Wrong network
`NetworkGuard` must wrap every write path. Shannon is `50312`; mainnet `5031`.

### Contract reads return zero/empty
ABI mismatch. Regenerate from `forge build` artifacts, not by hand.

### RPC rate limiting during the demo
Batch with `multicall`; raise the poll interval to 3s; consider the single cached route handler in
`10` — market metadata only.

## Deployment

### `forge script` fails to broadcast
Verify the RPC URL and that the deployer has STT. Try `--legacy` if EIP-1559 estimation misbehaves.

### Contract verification
✅ Confirmed working (PHASE 5). Shannon explorer is Blockscout, no API key:
```bash
forge verify-contract <addr> src/<Name>.sol:<Name> \
  --verifier blockscout --verifier-url https://shannon-explorer.somnia.network/api \
  --compiler-version 0.8.30 --num-of-optimizations 200 \
  --constructor-args <abi-encoded>  --watch
```
`bytecode_hash = "none"` + `cbor_metadata = false` in `foundry.toml` make it a clean match.
`forge verify-contract` reads `[etherscan]` config even with `--verifier blockscout`, so either set
`SOMNIA_EXPLORER_API_URL` / `EXPLORER_API_KEY` in the env or drop that section from `foundry.toml`.

## Demo day

### The dwell never completes
The book thinned and reset it. Keep `ec-maker` running with adequate size; raise `dwellSec` only if
you have shortened it below 30s.

### The market expired mid-demo
Windows are minutes. Check `marketExpiryNs` before recording; require ≥20 minutes of headroom.

### Everything worked yesterday and not today
Check, in order: registry balance, venue id, whether the target market still exists, and whether
`markets-sdk` was silently upgraded by a caret range. **Pin `0.28.1` exactly.**
