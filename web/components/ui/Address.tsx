"use client";

import { useState } from "react";
import { short } from "@/lib/format";
import { explorerAddress, explorerTx } from "@/lib/env";
import { cn } from "@/lib/cn";

export function Addr({
  value,
  kind = "address",
  className,
  full,
}: {
  value?: string;
  kind?: "address" | "tx";
  className?: string;
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="num text-fg-4">—</span>;
  const href = kind === "tx" ? explorerTx(value) : explorerAddress(value);

  return (
    <span className={cn("inline-flex items-center gap-1.5 num text-xs", className)}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-fg-2 hover:text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg-3"
        title={value}
      >
        {full ? value : short(value, kind === "tx" ? 10 : 6, kind === "tx" ? 8 : 4)}
      </a>
      <button
        aria-label="copy"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="text-fg-4 hover:text-fg-2 transition-colors"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}
