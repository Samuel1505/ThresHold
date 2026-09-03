"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { somniaShannon } from "@/lib/chain";
import { short } from "@/lib/format";
import { Button } from "@/components/ui/Button";

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const injected = connectors.find((c) => c.type === "injected") ?? connectors[0];

  if (!isConnected) {
    return (
      <Button
        size="sm"
        variant="default"
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected })}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </Button>
    );
  }

  const wrongChain = chainId !== somniaShannon.id;

  return (
    <div className="flex items-center gap-2">
      {wrongChain && (
        <Button size="sm" variant="danger" onClick={() => switchChain({ chainId: somniaShannon.id })}>
          Wrong network
        </Button>
      )}
      <button
        onClick={() => disconnect()}
        title="Disconnect"
        className="num rounded border border-line-strong bg-panel-2 px-3 h-8 text-xs text-fg-2 hover:text-fg hover:border-fg-3 transition-colors"
      >
        {short(address)}
      </button>
    </div>
  );
}
