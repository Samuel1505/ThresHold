import { Addr } from "@/components/ui/Address";
import { pct } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface ExecutionRecord {
  probabilityBps: number;
  success: boolean;
  execBlock?: bigint;
  execTx?: `0x${string}`;
  fillBlock?: bigint;
  fillTx?: `0x${string}`;
}

/**
 * The proof (docs/01, docs/09): the fill block and the action block side by side.
 * When they're equal — "same block as the fill that caused it".
 */
export function ExecutionCard({ record, className }: { record: ExecutionRecord; className?: string }) {
  const sameBlock =
    record.execBlock !== undefined &&
    record.fillBlock !== undefined &&
    record.execBlock === record.fillBlock;

  return (
    <div className={cn("rounded-lg border bg-panel", record.success ? "border-executed/25" : "border-failed/25", className)}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="label" style={{ color: record.success ? "var(--executed)" : "var(--failed)" }}>
          {record.success ? "Executed" : "Execution reverted"}
        </span>
        <span className="num text-xs text-fg-2">at {pct(record.probabilityBps, 2)}</span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-line">
        <BlockCol label="Fill" block={record.fillBlock} tx={record.fillTx} />
        <BlockCol label="Action" block={record.execBlock} tx={record.execTx} accent={record.success} />
      </div>

      <div className="border-t border-line px-4 py-2.5 text-xs">
        {sameBlock ? (
          <span className="text-executed">
            Same block — the action executed in the block the fill qualified it.
          </span>
        ) : record.execBlock !== undefined && record.fillBlock !== undefined ? (
          <span className="text-fg-3">
            +{(record.execBlock - record.fillBlock).toString()} block(s) after the qualifying fill —
            the dwell held between them. No transaction was sent to the target.
          </span>
        ) : (
          <span className="text-fg-4">block numbers pending…</span>
        )}
      </div>
    </div>
  );
}

function BlockCol({
  label,
  block,
  tx,
  accent,
}: {
  label: string;
  block?: bigint;
  tx?: `0x${string}`;
  accent?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <div className="label">{label} block</div>
      <div
        className="num mt-1 text-lg tabular-nums"
        style={{ color: accent ? "var(--executed)" : undefined }}
      >
        {block !== undefined ? block.toString() : "—"}
      </div>
      {tx ? <Addr value={tx} kind="tx" className="mt-1" /> : null}
    </div>
  );
}
