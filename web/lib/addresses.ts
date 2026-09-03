import type { Address } from "viem";

/** Threshold contracts on Shannon (docs/02 § PHASE 5 RESULTS, all verified on the explorer). */
export const REGISTRY = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
  "0xb31014A95Da14e94900a5b8c58087E8f754e596d") as Address;
export const HANDLER = (process.env.NEXT_PUBLIC_HANDLER_ADDRESS ??
  "0x693DC66E334674d5FF1ECf846d64E5086187195e") as Address;
export const DEMO_VAULT = (process.env.NEXT_PUBLIC_DEMO_VAULT_ADDRESS ??
  "0xcAc26cFD38d72F8730dEFA46a271D055246a1463") as Address;

/** DreamDEX protocol — CREATE3-deterministic, identical on both chains (docs/06). */
export const DREAMDEX = {
  binaryModule: "0x3ecC694Cef705358864a646142ac17A90E29e388",
  marketsCore: "0x2802504314685D89bF6C992CA5a8e7cC78bc0294",
  binarySettlement: "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23",
  testUsdc: "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E",
} as const;

export const PRECOMPILE = "0x0000000000000000000000000000000000000100" as Address;

/** DemoVault.derisk() — the only allow-listed action in the MVP. */
export const DERISK_SELECTOR = "0x78a5bf8f" as const;
