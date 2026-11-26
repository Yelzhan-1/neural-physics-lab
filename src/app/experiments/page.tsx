import type { Metadata } from "next";
import { ExperimentCenter } from "@/components/experiments/ExperimentCenter";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "Results · Neural Physics Lab",
  description: "How much lower the PINN error is when both models see only 5% of the data.",
};

export default function ExperimentsPage() {
  return (
    <>
      <SiteHeader current="results" />
      <main className="flex flex-1 flex-col">
        <ExperimentCenter />
      </main>
      <SiteFooter />
    </>
  );
}
