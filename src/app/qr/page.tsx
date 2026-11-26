import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "Scan to try · Neural Physics Lab",
  description: "QR code for the live Neural Physics Lab at neural-physics-lab-roan.vercel.app.",
};

export default function QrPage() {
  return (
    <>
      <SiteHeader current="qr" />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 sm:px-10 lg:grid-cols-2">
        <div>
          <p className="font-num text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Neural Physics Lab</p>
          <h1 className="mt-3 text-[clamp(3.2rem,7vw,6.2rem)] leading-[0.92] font-medium tracking-[-0.07em] text-foreground">
            Keep
            <br />
            exploring.
          </h1>
          <Link
            href="/lab"
            className="mt-8 inline-flex h-11 items-center rounded-full bg-pinn px-6 text-sm font-semibold text-[#14160c]"
          >
            Open the Lab
          </Link>
          <a
            href="https://neural-physics-lab-roan.vercel.app"
            className="mt-6 block font-num text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            neural-physics-lab-roan.vercel.app
          </a>
        </div>
        <figure className="w-full max-w-md justify-self-start rounded-[22px] bg-[#EDE6DA] p-4 text-[#14160c] lg:justify-self-end">
          <div className="bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/qr.svg"
              alt="QR code for https://neural-physics-lab-roan.vercel.app"
              width={420}
              height={420}
              className="w-full"
            />
          </div>
          <figcaption className="mt-3 flex justify-between px-1 font-num text-[10px] tracking-[0.14em] uppercase">
            <span>Scan to open</span>
            <span>Neural Physics Lab</span>
          </figcaption>
        </figure>
      </main>
      <SiteFooter />
    </>
  );
}
