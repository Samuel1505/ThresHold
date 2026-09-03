"use client";

import { cn } from "@/lib/cn";

interface Opt<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Opt<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex rounded border border-line-strong bg-well p-0.5 gap-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-7 px-3 rounded-[4px] text-xs font-medium transition-colors duration-fast ease-out",
              active
                ? "bg-panel-2 text-fg border border-line-strong"
                : "text-fg-3 hover:text-fg-2 border border-transparent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
