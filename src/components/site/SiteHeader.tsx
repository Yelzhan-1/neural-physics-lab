import Link from "next/link";
import type { ReactNode } from "react";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path
        d="M16 5 L9 16 L20 25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.75"
      />
      <path
        d="M27 18c-2 5-7 8-12 7"
        stroke="#22d3ee"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="16" cy="5" r="2" fill="currentColor" />
      <circle cx="9" cy="16" r="3" fill="#04050d" stroke="#22d3ee" strokeWidth="1.6" />
      <circle cx="20" cy="25" r="3.4" fill="#22d3ee" />
    </svg>
  );
}

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-5">
      <Link
        href="/"
        className="group flex min-w-0 items-center gap-2 text-[13px] font-semibold tracking-tight whitespace-nowrap text-white sm:gap-2.5 sm:text-[15px]"
      >
        <LogoMark className="size-7 shrink-0 transition-transform duration-500 group-hover:rotate-[-12deg]" />
        <span className="text-[12px] sm:text-[15px]">
          Neural Physics <span className="text-white/50">Lab</span>
        </span>
      </Link>
      <nav className="flex shrink-0 items-center gap-1 text-xs sm:gap-2 sm:text-sm">{children}</nav>
    </header>
  );
}
