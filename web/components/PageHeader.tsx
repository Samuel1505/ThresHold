import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  lede,
  right,
  back,
}: {
  title: ReactNode;
  lede?: ReactNode;
  right?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-7 animate-fade-in">
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg-2"
        >
          <span aria-hidden>←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-600 tracking-tight text-fg">{title}</h1>
          {lede ? <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-fg-3">{lede}</p> : null}
        </div>
        {right}
      </div>
    </div>
  );
}
