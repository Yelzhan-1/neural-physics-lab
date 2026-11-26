"use client";

import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChaosFan } from "@/components/landing/ChaosFan";
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
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "PageDown" && event.key !== "PageUp") {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" || event.key === "PageDown" ? 1 : -1;
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
      sections[Math.min(sections.length - 1, Math.max(0, index + direction))]?.scrollIntoView({
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
    <div ref={scroller} className="h-svh snap-y snap-mandatory overflow-y-auto">
      <ol className="fixed top-1/2 right-3 z-30 hidden -translate-y-1/2 flex-col gap-2 sm:flex">
        {BEATS.map((name, index) => (
          <li key={name}>
            <button
              type="button"
              aria-label={name}
              aria-current={beat === index ? "true" : undefined}
              onClick={() => go(index)}
              className={beat === index ? "block h-6 w-1.5 rounded-full bg-physics" : "block h-1.5 w-1.5 rounded-full bg-white/30"}
            />
          </li>
        ))}
      </ol>

      <section className="flex h-svh snap-start flex-col px-5 pt-20 sm:px-10">
        <div className="grid min-h-0 flex-1 items-end gap-6 pb-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
          <div className="max-w-xl pb-2">
            <p className="font-num text-[11px] tracking-[0.18em] text-white/40 uppercase">Double pendulum</p>
            <h1 className="mt-3 text-[clamp(3.4rem,8vw,7.4rem)] leading-[0.9] font-medium tracking-[-0.07em] text-white">
              Learning
              <br />
              from chaos.
            </h1>
            <p className="mt-5 max-w-sm text-base text-white/70">A small change in the start becomes another path.</p>
            <div className="mt-6 h-40 max-w-md overflow-hidden">
              <ChaosFan compact />
            </div>
          </div>
          <div className="h-[42svh] min-h-56 lg:h-[70svh]">
            <TrailArt
              mode="chaos"
              testId="pendulum-scene"
              label="Live RK4 double pendulum, drawn as a fading trail"
            />
          </div>
        </div>
      </section>

      <section className="grid h-svh snap-start items-end gap-4 px-5 pt-20 pb-10 lg:grid-cols-2 lg:items-center sm:px-10">
        <div className="h-[46svh] lg:h-[68svh]">
          <TrailArt mode="nn" label="Standard network rollout leaving the RK4 trail" />
        </div>
        <div className="max-w-md lg:justify-self-end">
          <p className="font-num text-[11px] tracking-[0.18em] text-nn uppercase">Standard NN</p>
          <h2 className="mt-3 text-[clamp(2.4rem,5vw,4.6rem)] leading-[0.95] font-medium tracking-[-0.06em] text-white">
            It copies the samples.
          </h2>
          <p className="mt-4 text-base text-white/70">Then the path leaves the physics.</p>
        </div>
      </section>

      <section className="grid h-svh snap-start items-end gap-4 px-5 pt-20 pb-10 lg:grid-cols-2 lg:items-center sm:px-10">
        <div className="order-2 max-w-md">
          <p className="font-num text-[11px] tracking-[0.18em] text-pinn uppercase">PINN</p>
          <h2 className="mt-3 text-[clamp(2.4rem,5vw,4.6rem)] leading-[0.95] font-medium tracking-[-0.06em] text-white">
            The equations stay in the loss.
          </h2>
          <p className="mt-4 text-base text-white/70">Same data. The laws are part of the grade.</p>
        </div>
        <div className="order-1 h-[46svh] lg:order-2 lg:h-[68svh]">
          <TrailArt mode="pinn" label="PINN rollout staying nearer the RK4 trail" />
        </div>
      </section>

      <section className="flex h-svh snap-start flex-col justify-center px-5 sm:px-10">
        <p className="font-num text-[11px] tracking-[0.18em] text-white/40 uppercase">5% of the data</p>
        <CountUp />
        <p className="mt-4 max-w-xl text-lg text-white/80 sm:text-2xl">
          6.1× lower error at 5% data — seed 2026
        </p>
        <p className="mt-2 font-num text-sm text-white/50">3-seed mean ≈ 3.2×</p>
        <div className="mt-8 flex h-24 max-w-xs items-end gap-3" aria-hidden>
          <span className="w-10 rounded-t bg-nn" style={{ height: "100%" }} />
          <span className="w-10 rounded-t bg-pinn" style={{ height: "16%" }} />
        </div>
      </section>

      <section className="flex h-svh snap-start flex-col justify-center px-5 sm:px-10">
        <p className="font-num text-[11px] tracking-[0.18em] text-white/40 uppercase">The lab</p>
        <h2 className="mt-3 text-[clamp(2.6rem,6vw,5rem)] leading-none font-medium tracking-[-0.06em] text-white">
          Four systems.
        </h2>
        <ul className="mt-8 max-w-xl">
          {SYSTEMS.map((system) => (
            <li key={system.id} className="border-t border-white/10">
              <Link
                href={HREF[system.id] ?? "/lab"}
                className="flex items-baseline justify-between gap-4 py-3 text-xl tracking-tight text-white hover:text-physics sm:text-2xl"
              >
                <span>{system.name}</span>
                <span className="font-num text-xs text-white/35">{system.code}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid h-svh snap-start content-center gap-10 px-5 sm:px-10 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-[clamp(3rem,7vw,6.2rem)] leading-[0.92] font-medium tracking-[-0.07em] text-white">
            Keep
            <br />
            exploring.
          </h2>
          <Link
            href="/lab"
            className="mt-8 inline-flex h-12 items-center rounded-full bg-physics px-7 text-sm font-semibold text-[#041018]"
          >
            Enter the Lab
          </Link>
        </div>
        <figure className="w-full max-w-sm justify-self-start rounded-3xl bg-[#d7f6ff] p-6 text-[#041820] lg:justify-self-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/qr.svg"
            alt="QR code for https://neural-physics-lab-roan.vercel.app"
            width={320}
            height={320}
            className="w-full"
          />
          <figcaption className="mt-3 flex justify-between font-num text-[10px] tracking-[0.14em] uppercase">
            <span>Scan to open</span>
            <span>The lab</span>
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
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [reduced]);

  return (
    <p ref={ref} className="font-num text-[clamp(6rem,18vw,13rem)] leading-none tracking-[-0.08em] text-physics">
      {value.toFixed(1)}×
    </p>
  );
}
