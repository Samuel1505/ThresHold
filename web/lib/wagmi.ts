import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { somniaShannon } from "./chain";
import { RPC_URL } from "./env";

/** In the browser, read through the same-origin proxy (`/api/rpc`) — the public
 *  Shannon RPC rate-limits per client and drops CORS headers on the throttled
 *  response. Server-side rendering talks to the RPC directly. */
const READ_RPC = typeof window === "undefined" ? RPC_URL : "/api/rpc";

export const wagmiConfig = createConfig({
  chains: [somniaShannon],
  connectors: [injected()],
  transports: {
    [somniaShannon.id]: http(READ_RPC, { batch: true }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
