import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "Scan to try · Neural Physics Lab",
  description: "QR code for the live Neural Physics Lab at neural-physics-lab-roan.vercel.app.",
};

export default function QrPage() {
  return (
    <>
      <SiteHeader>
        <Link
          href="/lab"
          className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-white"
        >
          Lab
        </Link>
        <Link
          href="/experiments"
          className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-white"
        >
          Experiments
        </Link>
        <Link
          href="/"
          className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-white"
        >
          About
        </Link>
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-5 pt-6 pb-20 text-center sm:px-8">
        <p className="text-xs font-medium tracking-[0.18em] text-physics uppercase">Scan to try</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Open the lab on a phone
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
          The code points at the live site. Training still happens in that browser. Nothing is sent to a server.
        </p>
        <div className="mt-8 rounded-3xl bg-white p-4 shadow-[0_0_80px_-24px_var(--physics)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/qr.svg"
            alt="QR code for https://neural-physics-lab-roan.vercel.app"
            width={320}
            height={320}
            className="size-64 sm:size-80"
          />
        </div>
        <a
          href="https://neural-physics-lab-roan.vercel.app"
          className="mt-6 font-num text-sm text-white/80 underline-offset-4 hover:underline"
        >
          neural-physics-lab-roan.vercel.app
        </a>
      </main>
    </>
  );
}
