"use client";

import type { ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { somniaShannon } from "@/lib/chain";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";

/**
 * Wraps every write path (docs/01). Read-only browsing works without this;
 * arming / cancelling prompts a connect or a network switch.
 */
export function NetworkGuard({ children }: { children: ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected) {
    return (
      <Panel className="p-5 text-sm text-fg-2">
        Connect a wallet to arm a trigger. Browsing markets and probability works without one.
      </Panel>
    );
  }
  if (chainId !== somniaShannon.id) {
    return (
      <Panel className="p-5 flex items-center justify-between gap-4">
        <span className="text-sm text-fg-2">
          Switch to <span className="text-fg">Somnia Shannon</span> (chain 50312) to continue.
        </span>
        <Button
          variant="primary"
          size="sm"
          disabled={isPending}
          onClick={() => switchChain({ chainId: somniaShannon.id })}
        >
          {isPending ? "Switching…" : "Switch network"}
        </Button>
      </Panel>
    );
  }
  return <>{children}</>;
}
