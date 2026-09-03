import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  value,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="label">{label}</label>
        {value ? <span className="num text-sm text-fg">{value}</span> : null}
      </div>
      {children}
      {hint ? <p className="text-xs text-fg-3 leading-relaxed">{hint}</p> : null}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  suffix,
  min,
  step,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  step?: number;
  className?: string;
}) {
  return (
    <div
      className={
        "flex items-center rounded border border-line-strong bg-well focus-within:border-fg-3 " +
        (className ?? "")
      }
    >
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="num w-full bg-transparent px-3 h-9 text-sm text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix ? <span className="pr-3 text-xs text-fg-3">{suffix}</span> : null}
    </div>
  );
}
