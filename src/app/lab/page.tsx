import type { Metadata } from "next";
import Link from "next/link";
import { Lab } from "@/components/lab/Lab";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "The Lab · Neural Physics Lab",
  description:
    "Train a standard neural network and a physics-informed one in the browser, then watch both roll out beside the RK4 double pendulum.",
};

export default function LabPage() {
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
      <Lab />
    </>
  );
}
