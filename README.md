# Threshold

**Probabilistic automation for DreamDEX Event Contracts.**

Threshold lets a smart contract execute an action when the market's capital-backed belief that
something will happen crosses a threshold and holds there — instead of after the event has already
occurred.

Built for the Somnia × DreamDEX Event Contracts Hackathon.

---

## Why it matters

Every automation primitive on-chain fires on a **fact that has already happened**. Keepers poll and
then submit; liquidations fire after the breach. By then the loss is taken.

Acting on *expectation* has meant trusting an off-chain model that no contract can verify and whose
operator loses nothing by being wrong.

A DreamDEX binary Event Contract's mid price is different: a probability bounded in `[0,1]`,
refreshed continuously, maintained by participants with capital at risk, and readable on-chain.

Threshold treats it as a **sensor**, not a betting venue.

## How it works

```
BinaryPool --OrderFilled--> Reactivity precompile (0x0100) --onEvent--> ThresholdHandler
                                                                              |
                            getBookLevels / closingTop / marketNonce          |
                                                                              v
                                                            gates G1-G8 + depth-weighted mid
                                                                              |
                                                                              v
                                                                  target.call{gas: cap}
```

1. A Somnia Reactivity subscription binds to a specific BinaryPool's `OrderFilled` event.
2. On every fill, the handler **re-reads the order book on-chain** — it never trusts the event payload.
3. It computes a **depth-weighted probability** across 8 levels per side, not the last trade price.
4. Eight validity gates must pass: market identity, not finalized, not expired, book present,
   two-sided, spread, depth per side.
5. If qualified, a **dwell timer** starts. The signal must persist against arbitrage.
6. On expiry of the dwell — re-validated — the handler dispatches an allow-listed contract call.

No keeper. No off-chain watcher. No liveness assumption.

### What makes it not-a-toy

- **Depth-weighted, not last-price.** A single wash trade moves the touch; it does not move a
  notional-weighted mid across eight levels.
- **Nonce pinning.** DreamDEX BinaryPools are *recycled* onto new markets. Triggers pin `marketNonce`
  at arm time and expire rather than silently firing on a different market's book.
- **Re-validation at dispatch**, not only at dwell start.
- **Scheduled dwell expiry** via `scheduleSubscriptionAtTimestamp`, so a trigger still evaluates when
  the book goes quiet.

## Architecture

| Contract | Role |
|---|---|
| `ThresholdRegistry` | Triggers, ownership, action allow-list, subscriptions, funding |
| `ThresholdHandler` | `SomniaEventHandler` subclass — the only precompile-callable surface |
| `ProbabilityLib` | Pure/view: VWAP, bps conversion, gates |
| `DemoVault` | Demo action target |

No backend. No database. No indexer. The frontend computes probability from the same on-chain reads
the handler uses, and parity is enforced by test.

## Setup

```bash
git clone <repo> && cd threshold
pnpm install
cp .env.example .env      # fill in per docs/17
forge build && forge test
pnpm --filter web dev
```

Requires Foundry, Node 20+, pnpm.

## Environment
See [`docs/17-environment-variables.md`](docs/17-environment-variables.md). Never commit a private key.

## Testing
```bash
forge test -vvv
forge test --match-contract Adversarial -vvv   # A1-A14
pnpm --filter web test                          # TS/Solidity parity
```

## Deployment
Somnia Shannon (chain `50312`). See [`docs/13-deployment.md`](docs/13-deployment.md).

> The registry must hold **≥ 32 STT** — `SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE` is
> checked against the *calling contract's* balance.

## Demo
[`docs/14-demo-script.md`](docs/14-demo-script.md).

## Contract addresses
| Contract | Shannon |
|---|---|
| ThresholdRegistry | `<filled at deploy>` |
| ThresholdHandler | `<filled at deploy>` |
| DemoVault | `<filled at deploy>` |

### DreamDEX (CREATE3, identical on both chains)
| | |
|---|---|
| BinaryMarketsModule | `0x3ecC694Cef705358864a646142ac17A90E29e388` |
| MarketsCore | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` |
| BinarySettlement | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` |
| OracleHub | `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b` |
| TestUSDC (Shannon, 6dp) | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` |

## Limitations — stated plainly

- **Testnet only. Not audited. Do not deploy as-is.**
- **Manipulation is reduced, not eliminated.** On a genuinely illiquid market, an attacker with enough
  capital can hold a manipulated price through the dwell. Set `minDepthPerSide` relative to the value
  of the action.
- **Arbitrary-target execution is admin-allow-listed**, not user-open.
- **Subscription funding is a shared resource.** Production needs per-user funding or rate limits.
- Anything still marked `NEEDS VERIFICATION` in [`docs/02`](docs/02-technical-research.md) is
  disclosed there rather than hidden.

## Docs
`docs/00` overview · `01` requirements · `02` **technical audit** · `03` architecture · `04` contracts ·
`05` **reactivity** · `06` DreamDEX integration · `07` **probability engine** · `08` trigger engine ·
`09` frontend · `10` backend (none) · `11` security · `12` testing · `13` deployment · `14` demo ·
`15` submission · `16` **build plan** · `17` env · `18` troubleshooting
