/** Public runtime config. All values are `NEXT_PUBLIC_*` — nothing secret ever lands here. */

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`missing ${name}`);
  return v;
}

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 50312);
export const RPC_URL = req("NEXT_PUBLIC_RPC_URL", "https://api.infra.testnet.somnia.network");
export const WS_RPC_URL =
  process.env.NEXT_PUBLIC_WS_RPC_URL ?? "wss://api.infra.testnet.somnia.network/ws";
export const EXPLORER_URL = req(
  "NEXT_PUBLIC_EXPLORER_URL",
  "https://shannon-explorer.somnia.network",
);
export const INDEXER_URL = req(
  "NEXT_PUBLIC_DREAMDEX_INDEXER_URL",
  "https://dev.smk.somnia.host/v1/graphql",
);
/** Optional venue scope — read off a live market row if unset (venue ids move). */
export const VENUE_ID = (process.env.NEXT_PUBLIC_VENUE_ID || undefined) as
  | `0x${string}`
  | undefined;

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER_URL}/address/${addr}`;
