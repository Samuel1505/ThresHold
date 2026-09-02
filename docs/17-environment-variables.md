# 17 — Environment Variables

`.env` is gitignored. `.env.example` holds placeholders only. **Never commit a real key.**

## Deployer / wallet

| Variable | Purpose | Required | Example | Secret |
|---|---|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Contract deployment | yes | `0x<64 hex>` | **YES** |
| `DEMO_TRADER_PRIVATE_KEY` | Demo bot placing crossing orders | demo only | `0x<64 hex>` | **YES** |

Use throwaway keys with testnet funds only.

## Network

| Variable | Purpose | Required | Example | Secret |
|---|---|---|---|---|
| `SOMNIA_SHANNON_RPC` | RPC endpoint | yes | *`NEEDS VERIFICATION`* | no |
| `SOMNIA_CHAIN_ID` | Chain id | yes | `50312` | no |
| `SOMNIA_EXPLORER_URL` | Explorer base | no | *`NEEDS VERIFICATION`* | no |

## DreamDEX

| Variable | Purpose | Required | Example | Secret |
|---|---|---|---|---|
| `DREAMDEX_REST_URL` | Market discovery | yes | `https://stg.api.dreamdex.io/v0` | no |
| `DREAMDEX_WS_URL` | Display updates | no | `wss://stg.api.dreamdex.io/v0/ws/public` | no |
| `VENUE_ID` | Binary venue | yes | *read from a live market row* | no |
| `OPERATOR_ID` | Alternative scope | no | — | no |
| `BINARY_MODULE` | BinaryMarketsModule | yes | `0x3ecC694Cef705358864a646142ac17A90E29e388` | no |
| `MARKETS_CORE` | MarketsCore | yes | `0x2802504314685D89bF6C992CA5a8e7cC78bc0294` | no |
| `BINARY_SETTLEMENT` | Settlement singleton | yes | `0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23` | no |
| `COLLATERAL_TOKEN` | TestUSDC on Shannon | yes | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` | no |
| `ORACLE_HUB` | OracleHub | no | `0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b` | no |

> `VENUE_ID` changed three times in the first week of August 2026. Read it from a live market row;
> never hardcode.

## Threshold contracts (post-deploy)

| Variable | Purpose | Required | Example | Secret |
|---|---|---|---|---|
| `THRESHOLD_REGISTRY` | Registry address | yes | `0x…` | no |
| `THRESHOLD_HANDLER` | Handler address | yes | `0x…` | no |
| `DEMO_VAULT` | Demo action target | yes | `0x…` | no |

## Reactivity

| Variable | Purpose | Required | Example | Secret |
|---|---|---|---|---|
| `REACTIVITY_PRECOMPILE` | Precompile address | no (constant) | `0x0000000000000000000000000000000000000100` | no |
| `SUBSCRIPTION_GAS_LIMIT` | Handler gas per callback | no | `10000000` | no |
| `SUBSCRIPTION_MAX_FEE_PER_GAS` | Fee cap (wei) | no | `20000000000` | no |
| `SUBSCRIPTION_PRIORITY_FEE_PER_GAS` | Priority fee (wei) | no | `1000000000` | no |

Constraint: `maxFeePerGas >= priorityFeePerGas + 6 gwei`, else `InvalidMaxFeePerGas`.
`gasLimit <= 200_000_000`, else `GasLimitExceeded`.

## Frontend (`NEXT_PUBLIC_*` — all public, never secret)

| Variable | Example |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | *`NEEDS VERIFICATION`* |
| `NEXT_PUBLIC_CHAIN_ID` | `50312` |
| `NEXT_PUBLIC_EXPLORER_URL` | *`NEEDS VERIFICATION`* |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | `0x…` |
| `NEXT_PUBLIC_HANDLER_ADDRESS` | `0x…` |
| `NEXT_PUBLIC_DEMO_VAULT_ADDRESS` | `0x…` |
| `NEXT_PUBLIC_DREAMDEX_REST_URL` | `https://stg.api.dreamdex.io/v0` |
| `NEXT_PUBLIC_VENUE_ID` | `…` |

**Never prefix a private key with `NEXT_PUBLIC_`.** It ships to every browser.
