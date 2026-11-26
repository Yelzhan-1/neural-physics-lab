import { Landing } from "@/components/landing/Landing";
import { SiteHeader } from "@/components/site/SiteHeader";

export default function HomePage() {
  return (
    <div className="h-svh overflow-hidden">
      <SiteHeader current="overview" overlay />
      <Landing />
    </div>
  );
}
