"use client";

import { cn } from "@/lib/cn";

/** A styled range input. Track fill + thumb tuned for the threshold slider. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn("th-slider w-full", className)}
      style={{ "--pct": `${pct}%` } as React.CSSProperties}
    />
  );
}
