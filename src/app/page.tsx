import { Landing } from "@/components/landing/Landing";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

export default function HomePage() {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <SiteHeader current="overview" />
      <main className="flex min-h-0 flex-1 flex-col">
        <Landing />
      </main>
      <SiteFooter />
    </div>
  );
}
