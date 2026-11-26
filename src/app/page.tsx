import Link from "next/link";
import { Landing } from "@/components/landing/Landing";
import { SiteHeader } from "@/components/site/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader>
        <Link
          href="/lab"
          className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-1.5 font-medium text-white/85 backdrop-blur-md transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
        >
          Open the Lab
        </Link>
      </SiteHeader>
      <Landing />
    </>
  );
}
