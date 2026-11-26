import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path
        d="M16 6 L10 16 L22 26"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="6" r="1.7" fill="#22d3ee" />
      <circle cx="10" cy="16" r="2.2" fill="#060a12" stroke="#f5b942" strokeWidth="1.5" />
      <circle cx="22" cy="26" r="2.4" fill="#b388ff" />
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
  overlay = false,
  children,
}: {
  current?: SiteSection;
  overlay?: boolean;
  children?: ReactNode;
}) {
  return (
    <header
      className={cn(
        "z-30 flex items-center justify-between gap-3 px-4 sm:px-8",
        overlay ? "pointer-events-none fixed inset-x-0 top-0 h-16" : "relative h-16",
      )}
    >
      <Link
        href="/"
        className="pointer-events-auto flex items-center gap-2 text-[15px] font-medium tracking-[-0.04em] text-white"
      >
        <LogoMark className="size-6 text-white" />
        Neural Physics Lab
      </Link>
      <nav
        aria-label="Pages"
        className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/12 bg-[#060a12]/80 px-1 py-1 text-[13px] backdrop-blur-md"
      >
        {LINKS.map((link) => {
          const active = link.id === current;
          return (
            <Link
              key={link.id}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-2.5 py-1 sm:px-3",
                active ? "text-physics" : "text-white/55 hover:text-white",
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
    <footer className="flex items-center justify-between px-4 py-4 font-num text-[10px] tracking-[0.14em] text-white/35 uppercase sm:px-8">
      <span>KIMEP AI Challenge</span>
      <span>Almaty</span>
    </footer>
  );
}
