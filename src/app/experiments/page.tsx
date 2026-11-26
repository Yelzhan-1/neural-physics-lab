import type { Metadata } from "next";
import Link from "next/link";
import { ExperimentCenter } from "@/components/experiments/ExperimentCenter";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "Experiments · Neural Physics Lab",
  description:
    "Four double-pendulum experiments comparing a standard neural network with a physics-informed one. Numbers come from the training run, not from a table typed by hand.",
};

export default function ExperimentsPage() {
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
          href="/"
          className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-white"
        >
          About
        </Link>
      </SiteHeader>
      <ExperimentCenter />
    </>
  );
}
