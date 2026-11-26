import Link from "next/link";
import { Landing } from "@/components/landing/Landing";
import { SiteHeader } from "@/components/site/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader>
        <Link
          href="/experiments"
          className="rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:text-white"
        >
          Experiments
        </Link>
        <Link
          href="/lab"
          className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 font-medium whitespace-nowrap text-white/85 backdrop-blur-md transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white sm:px-4"
        >
          <span className="sm:hidden">The Lab</span>
          <span className="hidden sm:inline">Open the Lab</span>
        </Link>
      </SiteHeader>
      <Landing />
    </>
  );
}
