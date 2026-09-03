import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <As className={cn("bg-panel border border-line rounded-lg", className)}>{children}</As>
  );
}

export function PanelHeader({
  title,
  right,
  sub,
}: {
  title: ReactNode;
  right?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-line">
      <div>
        <div className="label">{title}</div>
        {sub ? <div className="text-xs text-fg-3 mt-1">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}
