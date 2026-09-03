import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { REGISTRY, HANDLER, DEMO_VAULT } from "@/lib/addresses";
import { Addr } from "@/components/ui/Address";

export const metadata = { title: "How Threshold works" };

const GATES = [
  ["G1", "Trigger armed", "state is ARMED or OBSERVING"],
  ["G2", "Market identity", "marketNonce() == the value pinned at arm time — pools are recycled onto new markets"],
  ["G3", "Not finalized", "finalized() is false"],
  ["G4", "Not expired", "before marketExpiryNs and the trigger's own deadline"],
  ["G5", "Book present", "booksEmpty() is false"],
  ["G6", "Two-sided", "orders rest on both bid and ask"],
  ["G7", "Spread", "ask − bid ≤ the trigger's max spread"],
  ["G8", "Depth per side", "notional consumed reaching min-depth ≥ the trigger's minimum, each side"],
];

export default function DocsPage() {
  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader
        title="How it works"
        lede="Threshold treats a DreamDEX binary market's mid price as a sensor, not a betting venue."
      />

      <section className="space-y-3">
        <h2 className="label">The mechanism</h2>
        <p className="text-sm leading-relaxed text-fg-2">
          A binary Event Contract&apos;s mid price is a probability — bounded in [0,1], refreshed
          continuously, maintained by participants with capital at risk, and readable on-chain. That
          is a signal no oracle or model has: backed by capital, forward-looking, and settling
          on-chain so error is punished automatically.
        </p>
        <pre className="num overflow-x-auto rounded-lg border border-line bg-well p-4 text-xs leading-relaxed text-fg-2">
{`BinaryPool  --OrderFilled-->  Reactivity precompile (0x0100)
                                      |  onEvent, same block
                                      v
                              ThresholdHandler
        getBookLevels / getBinaryPoolParams / marketNonce
                                      |
                          gates G1-G8  +  depth-weighted mid
                                      |
                           dwell — the signal must hold
                                      |
                              target.call{gas: cap}`}
        </pre>
        <p className="text-sm leading-relaxed text-fg-3">
          On every fill the handler <span className="text-fg-2">re-reads the order book on-chain</span> —
          it never trusts the event payload. The <span className="num">fillPrice</span> in the event is
          a wake-up, nothing more.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="label">The eight gates</h2>
        <Panel>
          <ul className="divide-y divide-line">
            {GATES.map(([id, label, detail]) => (
              <li key={id} className="grid grid-cols-[2rem_9rem_1fr] items-start gap-3 px-4 py-2.5 text-xs">
                <span className="num text-fg-4">{id}</span>
                <span className="text-fg">{label}</span>
                <span className="text-fg-3">{detail}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="text-sm leading-relaxed text-fg-3">
          All eight must pass — evaluated cheapest-first, and again immediately before dispatch, not
          only at dwell start. Only then is the depth-weighted mid compared to the threshold.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="label">Why it&apos;s not a toy</h2>
        <dl className="space-y-3 text-sm">
          <Def t="Depth-weighted, not last-price">
            The signal is a notional-weighted mid across eight levels per side. A single wash trade
            moves the touch; it does not move that average. If it clears enough levels that the
            average moves, the attacker paid real size — the definition of a legitimate price move.
          </Def>
          <Def t="Nonce pinning">
            DreamDEX BinaryPools are recycled onto new markets. A trigger pins{" "}
            <span className="num">marketNonce</span> at arm time and goes <span className="num">EXPIRED</span>{" "}
            rather than silently firing on a different market&apos;s book.
          </Def>
          <Def t="Dwell resets, never pauses">
            A trigger that accumulated dwell across disqualifying gaps would fire on a probability that
            only qualified intermittently — exactly the manipulation the dwell exists to prevent.
          </Def>
          <Def t="Scheduled dwell expiry">
            When a trigger enters OBSERVING the handler schedules a one-shot precompile tick at dwell
            end, so it&apos;s evaluated even if the book goes completely quiet.
          </Def>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="label">Limitations — stated plainly</h2>
        <ul className="space-y-2 text-sm text-fg-3">
          <li>— Testnet only. Not audited. Do not deploy as-is.</li>
          <li>
            — Manipulation is <span className="text-fg-2">reduced, not eliminated</span>. On a
            genuinely illiquid market, enough capital can hold a manipulated price through the dwell.
            Set min-depth relative to the value of the action.
          </li>
          <li>— Arbitrary-target execution is admin-allow-listed, not user-open.</li>
          <li>— Subscription funding is a shared resource; production needs per-user funding.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="label">Deployed on Shannon</h2>
        <Panel>
          <dl className="divide-y divide-line text-xs">
            <Row k="ThresholdRegistry" v={<Addr value={REGISTRY} />} />
            <Row k="ThresholdHandler" v={<Addr value={HANDLER} />} />
            <Row k="DemoVault" v={<Addr value={DEMO_VAULT} />} />
          </dl>
        </Panel>
        <p className="text-xs text-fg-4">
          No backend. No database. No indexer for anything that decides state. The frontend computes
          probability from the same on-chain reads as the handler — <Link href="/markets" className="underline decoration-line-strong underline-offset-2 hover:text-fg-3">see for yourself</Link>.
        </p>
      </section>
    </div>
  );
}

function Def({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-fg font-500">{t}</dt>
      <dd className="mt-1 leading-relaxed text-fg-3">{children}</dd>
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="num text-fg-3">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
