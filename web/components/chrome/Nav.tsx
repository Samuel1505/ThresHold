"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { WalletButton } from "./WalletButton";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/markets", label: "Markets" },
  { href: "/triggers", label: "Triggers" },
  { href: "/demo", label: "Demo" },
  { href: "/docs", label: "How it works" },
];

export function Nav() {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <Mark />
          <span className="text-sm font-600 tracking-tight">Threshold</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition-colors duration-fast ease-out whitespace-nowrap",
                isActive(l.href)
                  ? "text-fg bg-panel-2"
                  : "text-fg-3 hover:text-fg-2",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

function Mark() {
  // belief → threshold → action, as a glyph: a rising trace crossing a line
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M2 14 L7 12 L10 13 L18 5" stroke="var(--armed)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="1" y1="9.5" x2="19" y2="9.5" stroke="var(--threshold)" strokeWidth="1" strokeDasharray="2 2" />
      <circle cx="18" cy="5" r="2" fill="var(--executed)" />
    </svg>
  );
}
