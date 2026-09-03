import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { somniaShannon } from "./chain";
import { RPC_URL } from "./env";

export const wagmiConfig = createConfig({
  chains: [somniaShannon],
  connectors: [injected()],
  transports: {
    [somniaShannon.id]: http(RPC_URL, { batch: true }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
