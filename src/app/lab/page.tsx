import type { Metadata } from "next";
import { Suspense } from "react";
import { Lab } from "@/components/lab/Lab";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

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
      <SiteHeader current="lab" />
      <Suspense fallback={<main className="flex-1 px-8 py-16 text-sm text-muted-foreground">Loading the lab…</main>}>
        <LabGate searchParams={searchParams} />
      </Suspense>
      <SiteFooter />
    </>
  );
}

async function LabGate({ searchParams }: { searchParams: Promise<{ demo?: string; system?: string }> }) {
  const params = await searchParams;
  return <Lab demo={params.demo === "1"} system={params.system ?? "pendulum"} />;
}
