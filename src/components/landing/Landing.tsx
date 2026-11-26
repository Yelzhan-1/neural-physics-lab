"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TrailArt } from "@/components/landing/TrailArt";
import { SYSTEMS } from "@/ml/systems";

const HREF: Record<string, string> = {
  "double-pendulum": "/lab",
  "spring-mass": "/lab?system=spring",
  projectile: "/lab?system=projectile",
  orbital: "/lab?system=orbital",
};

const BEATS = ["Chaos", "Network", "PINN", "Result", "Systems", "Enter"];

export function Landing() {
  const scroller = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const sections = [...root.querySelectorAll<HTMLElement>("section")];
    const onScroll = () => {
      const top = root.scrollTop;
      let index = 0;
      let best = Infinity;
      sections.forEach((section, i) => {
        const distance = Math.abs(section.offsetTop - top);
        if (distance < best) {
          best = distance;
          index = i;
        }
      });
      setBeat(index);
    };
    const onKey = (event: KeyboardEvent) => {
      const keys = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"];
      if (!keys.includes(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
      event.preventDefault();
      const top = root.scrollTop;
      let index = 0;
      let best = Infinity;
      sections.forEach((section, i) => {
        const distance = Math.abs(section.offsetTop - top);
        if (distance < best) {
          best = distance;
          index = i;
        }
      });
      const next =
        event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : index + (event.key === "ArrowDown" || event.key === "PageDown" ? 1 : -1);
      sections[Math.min(sections.length - 1, Math.max(0, next))]?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [reduced]);

  const go = (index: number) => {
    const root = scroller.current;
    root?.querySelectorAll("section")[index]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div
      ref={scroller}
      tabIndex={0}
      aria-label="Story"
      className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto focus-visible:outline-none"
    >
      <ol aria-label="Beats" className="fixed top-1/2 right-3 z-30 hidden -translate-y-1/2 flex-col gap-2 sm:flex">
        {BEATS.map((name, index) => (
          <li key={name}>
            <button
              type="button"
              aria-label={name}
              aria-current={beat === index ? "true" : undefined}
              onClick={() => go(index)}
              className={beat === index ? "block h-6 w-1.5 rounded-full bg-foreground" : "block h-1.5 w-1.5 rounded-full bg-foreground/30"}
            />
          </li>
        ))}
      </ol>

      <section className="grid h-full snap-start grid-rows-[minmax(0,1fr)_auto] px-5 py-6 sm:px-10">
        <div className="grid min-h-0 items-end gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="order-2 max-w-xl lg:order-1">
            <h1 className="text-[clamp(3.2rem,7vw,6.4rem)] leading-[0.9] font-medium tracking-[-0.065em] text-foreground">
              Learning
              <br />
              from chaos.
            </h1>
            <p className="mt-4 max-w-sm text-base text-foreground/80">AI that learns from the laws of nature.</p>
            <Link
              href="/lab"
              className="mt-6 inline-flex h-11 items-center rounded-full bg-pinn px-6 text-sm font-semibold text-[#14160c]"
            >
              Enter the Lab
            </Link>
          </div>
          <div className="order-1 h-[46%] min-h-56 w-full lg:order-2 lg:h-full">
            <TrailArt
              mode="chaos"
              testId="pendulum-scene"
              label="Live RK4 double pendulum, drawn as a fading trail"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 font-num text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span>Double pendulum</span>
          <span>RK4 trajectory</span>
        </div>
      </section>

      <section className="grid h-full snap-start items-end gap-6 px-5 py-8 lg:grid-cols-2 lg:items-center sm:px-10">
        <div className="h-[42svh] min-h-56 lg:h-[58svh]">
          <TrailArt mode="nn" label="Standard network rollout leaving the RK4 trail" />
        </div>
        <div className="max-w-lg lg:justify-self-end">
          <p className="font-num text-[11px] tracking-[0.16em] text-nn uppercase">Standard NN</p>
          <h2 className="mt-3 text-[clamp(2.6rem,5.4vw,4.8rem)] leading-[0.94] font-medium tracking-[-0.06em] text-foreground">
            It copies the samples.
          </h2>
          <p className="mt-4 max-w-sm text-lg text-foreground/75">Then the path leaves the physics.</p>
        </div>
      </section>

      <section className="grid h-full snap-start items-end gap-6 px-5 py-8 lg:grid-cols-2 lg:items-center sm:px-10">
        <div className="order-2 max-w-lg">
          <p className="font-num text-[11px] tracking-[0.16em] text-pinn uppercase">PINN</p>
          <h2 className="mt-3 text-[clamp(2.6rem,5.4vw,4.8rem)] leading-[0.94] font-medium tracking-[-0.06em] text-foreground">
            The laws stay in the loss.
          </h2>
          <p className="mt-4 max-w-sm text-lg text-foreground/75">Same data. The equations are part of the grade.</p>
        </div>
        <div className="order-1 h-[42svh] min-h-56 lg:order-2 lg:h-[58svh]">
          <TrailArt mode="pinn" label="PINN rollout staying nearer the RK4 trail" />
        </div>
      </section>

      <section className="flex h-full snap-start items-center justify-center px-5 sm:px-10">
        <div className="flex w-full max-w-4xl flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-center lg:gap-[120px]">
          <div className="max-w-xl">
            <p className="font-num text-[11px] tracking-[0.16em] text-muted-foreground uppercase">5% of the data · seed 2026</p>
            <CountUp />
            <p className="mt-3 text-balance text-xl text-foreground/85 sm:text-2xl">
              6.1× lower error at 5% data — seed 2026
            </p>
            <p className="mt-2 font-num text-sm text-muted-foreground">3-seed mean ≈ 3.2×</p>
          </div>
          <div className="flex items-end gap-8">
            <figure>
              <div className="h-40 w-14 rounded-t-[4px] bg-nn lg:h-[220px]" />
              <figcaption className="mt-3 font-num text-xs leading-snug text-nn">
                Standard NN
                <br />
                50.05 MSE
              </figcaption>
            </figure>
            <figure>
              <div className="h-7 w-14 rounded-t-[4px] bg-pinn lg:h-9" />
              <figcaption className="mt-3 font-num text-xs leading-snug text-pinn">
                PINN
                <br />
                8.23 MSE
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="flex h-full snap-start flex-col justify-center px-5 sm:px-10">
        <p className="font-num text-[11px] tracking-[0.16em] text-muted-foreground uppercase">The lab</p>
        <h2 className="mt-3 text-[clamp(2.8rem,6vw,5.2rem)] leading-none font-medium tracking-[-0.06em] text-foreground">
          Four systems.
        </h2>
        <ul className="mt-8 max-w-xl border-b border-hairline">
          {SYSTEMS.map((system) => (
            <li key={system.id} className="border-t border-hairline">
              <Link
                href={HREF[system.id] ?? "/lab"}
                className="flex items-baseline justify-between gap-4 py-3 text-xl tracking-tight text-foreground hover:text-pinn sm:text-2xl"
              >
                <span>{system.name}</span>
                <span className="font-num text-xs text-muted-foreground">{system.code}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid h-full snap-start content-center gap-10 px-5 sm:px-10 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="font-num text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Neural Physics Lab</p>
          <h2 className="mt-3 text-[clamp(3rem,7vw,6rem)] leading-[0.92] font-medium tracking-[-0.07em] text-foreground">
            Keep
            <br />
            exploring.
          </h2>
          <Link
            href="/lab"
            className="mt-8 inline-flex h-11 items-center rounded-full bg-pinn px-6 text-sm font-semibold text-[#14160c]"
          >
            Enter the Lab
          </Link>
        </div>
        <figure className="w-full max-w-sm justify-self-start rounded-[22px] bg-[#EDE6DA] p-4 text-[#14160c] lg:justify-self-end">
          <div className="bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/qr.svg"
              alt="QR code for https://neural-physics-lab-roan.vercel.app"
              width={320}
              height={320}
              className="w-full"
            />
          </div>
          <figcaption className="mt-3 flex justify-between px-1 font-num text-[10px] tracking-[0.14em] uppercase">
            <span>Scan to open</span>
            <span>Neural Physics Lab</span>
          </figcaption>
        </figure>
      </section>
    </div>
  );
}

function CountUp() {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? 6.1 : 0);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (reduced) return;
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    let start = 0;
    const duration = 900;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(6.1 * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        frame = requestAnimationFrame(tick);
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [reduced]);

  return (
    <p
      ref={ref}
      aria-hidden={reduced ? undefined : true}
      className="font-num text-[clamp(5.5rem,16vw,11rem)] leading-none tracking-[-0.08em] text-pinn"
    >
      {value.toFixed(1)}×
    </p>
  );
}
