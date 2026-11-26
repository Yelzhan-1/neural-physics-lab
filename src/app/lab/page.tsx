import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Lab } from "@/components/lab/Lab";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "The Lab · Neural Physics Lab",
  description:
    "Train a standard neural network and a physics-informed one in the browser, then watch both roll out beside the RK4 double pendulum.",
};

export default function LabPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; system?: string }>;
}) {
  return (
    <>
      <SiteHeader>
        <span className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
          <span className="size-1.5 rounded-full bg-physics shadow-[0_0_8px_var(--physics)]" />
          RK4 · 240 steps per second
        </span>
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
      <Suspense fallback={<main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-16 text-sm text-white/50">Loading the lab…</main>}>
        <LabGate searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LabGate({ searchParams }: { searchParams: Promise<{ demo?: string; system?: string }> }) {
  const params = await searchParams;
  return <Lab demo={params.demo === "1"} system={params.system ?? "pendulum"} />;
}
