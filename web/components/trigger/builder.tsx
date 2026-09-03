"use client";

import { Segmented } from "@/components/ui/Segmented";
import { Field, NumberInput } from "@/components/ui/Field";
import { DEMO_VAULT, DERISK_SELECTOR } from "@/lib/addresses";
import { Direction } from "@/lib/types";

/** Dwell presets — 5s / 30s / 60s / custom (docs/01). */
export function DwellSelector({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const presets = [5, 30, 60];
  const isCustom = !presets.includes(value);
  return (
    <div className="space-y-2">
      <Segmented
        options={[
          ...presets.map((p) => ({ value: String(p), label: `${p}s` })),
          { value: "custom", label: "Custom" },
        ]}
        value={isCustom ? "custom" : String(value)}
        onChange={(v) => onChange(v === "custom" ? Math.max(min, value) : Number(v))}
      />
      {isCustom && (
        <NumberInput
          value={value}
          min={min}
          step={1}
          suffix={`s · ${min}–${max}`}
          onChange={(v) => onChange(Math.max(min, Math.min(max, Math.round(v || min))))}
        />
      )}
    </div>
  );
}

export interface ActionChoice {
  target: `0x${string}`;
  selector: `0x${string}`;
  label: string;
  description: string;
}

/** MVP: DemoVault.derisk() is the only allow-listed action (docs/04). */
export const ACTIONS: ActionChoice[] = [
  {
    target: DEMO_VAULT,
    selector: DERISK_SELECTOR,
    label: "DemoVault.derisk()",
    description: "Moves the vault's risky balance to safe. Restricted to the handler.",
  },
];

export function ActionSelector({
  value,
  onChange,
}: {
  value: ActionChoice;
  onChange: (a: ActionChoice) => void;
}) {
  return (
    <div className="space-y-2">
      {ACTIONS.map((a) => {
        const active = a.selector === value.selector && a.target === value.target;
        return (
          <button
            key={a.selector + a.target}
            onClick={() => onChange(a)}
            className={
              "block w-full rounded border px-3 py-2.5 text-left transition-colors duration-fast ease-out " +
              (active
                ? "border-armed/40 bg-armed/[0.06]"
                : "border-line-strong hover:border-fg-3")
            }
          >
            <div className="num text-sm text-fg">{a.label}</div>
            <div className="mt-0.5 text-xs text-fg-3">{a.description}</div>
          </button>
        );
      })}
      <p className="text-xs text-fg-4">
        Arbitrary <span className="num">(target, selector)</span> calls are admin-allow-listed, not
        user-open, in the MVP (docs/11).
      </p>
    </div>
  );
}

export function DirectionToggle({
  value,
  onChange,
}: {
  value: Direction;
  onChange: (d: Direction) => void;
}) {
  return (
    <Segmented
      options={[
        { value: "0", label: "Rises above" },
        { value: "1", label: "Falls below" },
      ]}
      value={String(value)}
      onChange={(v) => onChange(Number(v) as Direction)}
    />
  );
}

export { Field, NumberInput };
