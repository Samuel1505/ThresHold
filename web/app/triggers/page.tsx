"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useMyTriggers } from "@/hooks/useTriggers";
import { useMarkets } from "@/hooks/useMarkets";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { TriggerCard } from "@/components/trigger/TriggerCard";
import { isActive } from "@/lib/types";

export default function TriggersPage() {
  const { isConnected } = useAccount();
  const { triggers, isLoading } = useMyTriggers();
  const markets = useMarkets();

  const label = (pool: string) => {
    const m = markets.data?.find((x) => x.pool.toLowerCase() === pool.toLowerCase());
    return m ? `${m.asset} ${m.interval}` : undefined;
  };

  const active = triggers.filter((t) => isActive(t.state));
  const done = triggers.filter((t) => !isActive(t.state));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your triggers"
        lede="State is read from the registry — the only authority on whether a trigger fired."
        right={
          <Link href="/markets">
            <Button variant="primary">Arm a trigger →</Button>
          </Link>
        }
      />

      {!isConnected && (
        <Panel className="p-6 text-sm text-fg-3">
          Connect a wallet to see your triggers. Anyone can browse markets and probability without one.
        </Panel>
      )}

      {isConnected && isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      )}

      {isConnected && !isLoading && triggers.length === 0 && (
        <Panel className="p-6 text-sm text-fg-3">No triggers yet.</Panel>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="label mb-3">Active · {active.length}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {active.map((t) => (
              <TriggerCard key={t.id.toString()} trigger={t} marketLabel={label(t.pool)} />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="label mb-3">Finished · {done.length}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {done.map((t) => (
              <TriggerCard key={t.id.toString()} trigger={t} marketLabel={label(t.pool)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
