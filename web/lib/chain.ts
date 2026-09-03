import { defineChain } from "viem";
import { CHAIN_ID, RPC_URL, WS_RPC_URL, EXPLORER_URL } from "./env";

/** Somnia Shannon testnet — chain 50312. Verified from docs.somnia.network (docs/02). */
export const somniaShannon = defineChain({
  id: CHAIN_ID,
  name: "Somnia Shannon",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL], webSocket: [WS_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Shannon Explorer", url: EXPLORER_URL },
  },
  contracts: {
    multicall3: { address: "0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223" },
  },
  testnet: true,
});
