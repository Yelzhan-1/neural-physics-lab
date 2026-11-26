import { Landing } from "@/components/landing/Landing";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

export default function HomePage() {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <SiteHeader current="overview" />
      <Landing />
      <SiteFooter />
    </div>
  );
}
