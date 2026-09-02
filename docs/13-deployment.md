# 13 — Deployment

## Environments

| Env | Chain | Purpose |
|---|---|---|
| Local | Anvil | Unit + adversarial tests with `MockBinaryPool` |
| Shannon | 50312 | The submission target |

**Mainnet (5031) is out of scope.** Submission rules require a testnet prototype.

## Prerequisites

| Item | How | Status |
|---|---|---|
| Foundry | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` | `CONFIRMED` |
| Node 20+ / pnpm | — | `CONFIRMED` |
| Shannon RPC URL | https://docs.somnia.network | `NEEDS VERIFICATION` |
| Explorer URL | same | `NEEDS VERIFICATION` |
| STT for deployer | Somnia faucet | `NEEDS VERIFICATION` |
| **≥32 STT for the registry** | faucet, possibly multiple claims, or ask in hackathon Telegram | **BLOCKER-1** |
| TestUSDC | `faucet(uint256)` on `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` | `CONFIRMED` |

## Deployment order

```
1. DemoVault              (constructor: handler placeholder, set after)
2. ThresholdRegistry      (constructor: admin)
3. ThresholdHandler       (constructor: registry address)
4. registry.setHandler(handler)
5. vault.setHandler(handler)
6. registry.setActionAllowed(vault, DemoVault.derisk.selector, true)
7. Fund registry with >= 32 STT      <-- BLOCKER-1 gate
8. Verify: registry.balance >= 32 ether
```

Steps 1–6 are cheap and reversible. **Step 7 is the one that can fail.** Do it first, standalone, in
PHASE 0 — before any contract is written.

## Commands

```bash
# Build & test
forge build
forge test -vvv
forge test --match-contract Adversarial -vvv

# Deploy (mark: RPC URL NEEDS VERIFICATION)
forge script script/Deploy.s.sol \
  --rpc-url $SOMNIA_SHANNON_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast

# Fund the registry
cast send $REGISTRY_ADDRESS --value 32ether \
  --rpc-url $SOMNIA_SHANNON_RPC --private-key $DEPLOYER_PRIVATE_KEY

# Confirm
cast balance $REGISTRY_ADDRESS --rpc-url $SOMNIA_SHANNON_RPC

# TestUSDC faucet
cast send 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E "faucet(uint256)" 1000000000 \
  --rpc-url $SOMNIA_SHANNON_RPC --private-key $DEPLOYER_PRIVATE_KEY
```

`NEEDS VERIFICATION` — contract verification command and explorer API. Somnia's explorer may use
Blockscout (`forge verify-contract --verifier blockscout`); confirm before relying on it.

## Reactivity subscription setup

Subscriptions are created **from the registry contract**, not from a script — `SomniaExtensions`
checks the *calling contract's* balance against `SUBSCRIPTION_OWNER_MINIMUM_BALANCE`. The first
`createTrigger` on a pool triggers `_subscribe`. Verify:

```bash
cast call $REGISTRY_ADDRESS "poolSubscriptionId(address)(uint256)" $POOL_ADDRESS \
  --rpc-url $SOMNIA_SHANNON_RPC
```
A non-zero result means the subscription exists.

## Frontend deploy

Vercel. Env vars per `17`. Only `NEXT_PUBLIC_*` values reach the client; **no private keys, ever.**

## Pre-demo checklist

- [ ] Registry balance ≥ 32 STT **plus** callback gas headroom
- [ ] `DemoVault.derisk()` allow-listed
- [ ] `DemoVault.reset()` works — you will re-record
- [ ] `ec-maker` running with a two-sided book on the target market
- [ ] Target market has ≥ 15 minutes to expiry
- [ ] Frontend deployed and pointed at deployed addresses
- [ ] A dry run completed end-to-end within the last hour
