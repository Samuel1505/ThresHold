# 11 — Security Analysis

## SECURITY INVARIANTS

These must hold at all times. Every test in `12` maps to one.

1. **I1** — Only `address(0x0100)` can invoke `ThresholdHandler.onEvent`.
2. **I2** — A trigger executes at most once per `(triggerId, dwell cycle)`.
3. **I3** — A trigger never executes while `marketNonce != pinnedNonce`.
4. **I4** — A trigger never executes when any of gates G3–G8 fails, evaluated **at dispatch time**.
5. **I5** — A trigger's action can only be a `(target, selector)` pair on the admin allow-list.
6. **I6** — No user-supplied data reaches an external call except as `payload` bytes after an
   allow-listed selector.
7. **I7** — A reverting or gas-griefing target cannot prevent other triggers from evaluating.
8. **I8** — Only a trigger's owner can cancel it; only the handler can mutate its state.
9. **I9** — The registry's balance never drops below `32 ether` via `withdrawSurplus`.
10. **I10** — No off-chain component can cause or prevent an execution.

## Threat analysis

### Arbitrary calldata execution — **highest severity**
*Risk:* a trigger whose `target` is the registry itself, or an ERC-20 `approve`, turns Threshold into
a confused deputy that acts with the handler's authority.

*Mitigations:*
- `(target, selector)` allow-list, admin-curated. Users choose from allow-listed actions; they do not
  supply arbitrary targets in the MVP.
- `selector` stored separately from `payload`, so a user cannot substitute a different function.
- Explicit denylist: `target != address(registry)`, `target != address(handler)`,
  `target != PRECOMPILE`, `target != address(0)`.
- `call` only. **Never `delegatecall`.** Never `selfdestruct`. No value transfer with the call.
- `actionGasCap <= 500_000`.

For the demo, `DemoVault.derisk()` is the only allow-listed action, and `DemoVault` restricts
`derisk()` to `msg.sender == handler`. Defense on both sides.

### Callback / event spoofing
*Risk:* an attacker deploys a contract that emits a fake `OrderFilled` and tricks the handler.

*Mitigation:* subscriptions filter on `emitter = <specific pool address>`, so the precompile only
delivers logs from that pool. Additionally the handler checks `registry.triggersByPool(emitter)` is
non-empty. An attacker's contract is not a pool anyone has triggers on. **The handler never trusts the
event payload** — the signal is re-read from the pool by address.

### Market manipulation — the central economic threat
*Risk:* an attacker moves the probability across the threshold to force someone's trigger.

*Mitigations, layered:*
1. **Depth-weighted mid, not last price.** A single fill against a thin quote does not move a
   notional-weighted average across 8 levels.
2. **Minimum depth per side.** Below `minDepthPerSide`, the book is declared uninformative and no
   evaluation occurs at all.
3. **Maximum spread.** A wide book is rejected, which is exactly the state an attacker creates by
   pulling quotes before pushing price.
4. **Dwell.** The manipulated state must persist for `dwellSec` against arbitrage, which means paying
   to hold an off-market price against every other participant.
5. **Two-sided requirement.** A one-sided book is invalid — the cheapest manipulation is to remove
   one side, and this catches it.

*Residual risk, stated honestly:* on a genuinely illiquid market, an attacker with sufficient capital
can hold a manipulated price through the dwell. Threshold reduces the attack from "one wash trade"
to "sustained capital at risk against arbitrageurs." **It does not eliminate it.** Users must set
`minDepthPerSide` relative to the value of the action being triggered. The UI must say so.

### Reentrancy
`_execute` writes state before the external call. Registry mutators are `nonReentrant` and
`onlyHandler`. `DemoVault.derisk()` is `onlyHandler`. The precompile is the only entry to `onEvent`.

### Replay / duplicate execution
Terminal states checked at entry; state written before dispatch. Covers the scheduled-callback and
`OrderFilled`-callback collision (see `08` §Idempotency).

### Gas griefing / DoS
- `MAX_TRIGGERS_PER_POOL = 16` bounds the loop.
- `actionGasCap` bounds each dispatch.
- `try/catch` per trigger (I7).
- `maxLevels = 8` bounds book reads.
- Worst case must fit in the 10M subscription gas limit — **measure it in `12`**, do not assume.

### Stale probability
G3–G8 re-evaluated at dispatch, not only at dwell start. `marketExpiryNs` checked every callback.

### Subscription abuse
Anyone can create triggers, and each subscription costs the registry gas per handled event. An
attacker could create triggers on high-traffic pools to drain the balance.
- **MVP mitigation:** `MAX_TRIGGERS_PER_POOL`, plus a `createTrigger` deposit (e.g. 0.1 STT)
  refunded on cancel.
- **Documented limitation:** a production version needs per-user rate limits or user-funded
  subscriptions. Say this in the README rather than pretending it is solved.

### Trigger hijacking
`onlyOwner` on cancel; `onlyHandler` on state mutation; trigger IDs are sequential and non-guessable
authority is never granted by ID alone.

### Malicious market/pool address
A user could point a trigger at a contract that mimics `IBinaryPool` and returns fabricated book
data — but it would only trigger *their own* allow-listed action. **MVP mitigation:** validate at
`createTrigger` that the pool was created by the known `BinaryMarketsModule`
(`0x3ecC694Cef705358864a646142ac17A90E29e388`), via the module's market registry or by checking
`getBinaryPoolParams().market` resolves. `NEEDS VERIFICATION` — confirm the exact read that proves
pool provenance; if none is cheap, restrict `createTrigger` to pools discovered from
`listBinaryMarkets` and stored in an admin-maintained set.

## Out of scope, stated plainly
- No formal verification.
- No audit.
- Testnet only. **The README must say: do not deploy this to mainnet as-is.**
