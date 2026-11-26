import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path
        d="M8 22 L16 8 L24 22"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const LINKS = [
  { href: "/", id: "overview", label: "Overview" },
  { href: "/lab", id: "lab", label: "Lab" },
  { href: "/experiments", id: "results", label: "Results" },
  { href: "/qr", id: "qr", label: "QR" },
] as const;

export type SiteSection = (typeof LINKS)[number]["id"];

export function SiteHeader({
  current,
  children,
}: {
  current?: SiteSection;
  overlay?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3 sm:px-6">
      <Link
        href="/"
        className="flex min-w-0 items-center gap-2 text-[14px] font-medium tracking-[-0.04em] text-foreground"
      >
        <LogoMark className="size-5 shrink-0 text-foreground" />
        <span className="truncate">Neural Physics Lab</span>
      </Link>
      <nav
        aria-label="Pages"
        className="flex shrink-0 items-center rounded-full border border-hairline p-0.5 text-[12px] sm:text-[13px]"
      >
        {LINKS.map((link) => {
          const active = link.id === current;
          return (
            <Link
              key={link.id}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-2 py-1 sm:px-3",
                active ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                link.id === "overview" && "max-[420px]:hidden",
              )}
            >
              {link.label}
            </Link>
          );
        })}
        {children}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="flex h-10 shrink-0 items-center justify-between gap-3 border-t border-hairline px-3 font-num text-[10px] tracking-[0.14em] text-muted-foreground uppercase sm:px-6">
      <span>KIMEP AI Challenge</span>
      <span className="text-right">Almaty / 27 Nov 2026</span>
    </footer>
  );
}
