"use client";

import { useEffect, useRef } from "react";
import { ENERGY_COLORS, EnergyChart } from "@/components/scene/EnergyChart";
import type { LabRuntime } from "@/components/scene/runtime";
import { SpotlightCard } from "@/components/site/SpotlightCard";

/** Text readouts refresh every this many frames (10 Hz at 60 fps). */
const READOUT_INTERVAL = 6;

const ROWS = [
  { label: "Position", unit: "m" },
  { label: "Velocity", unit: "m/s" },
  { label: "Acceleration", unit: "m/s²" },
] as const;

function signed(value: number, digits = 2): string {
  const text = Math.abs(value).toFixed(digits);
  return (value < 0 && Number(text) !== 0 ? "−" : "+") + text;
}

/**
 * Live telemetry of the physics pendulum. Numbers are written straight into
 * the DOM from the runtime's frame callback, so the panel never re-renders
 * while the simulation runs.
 */
export function PhysicsPanel({ runtime }: { runtime: LabRuntime }) {
  // 12 vector components (3 rows x 2 bobs x 2 axes), then K, V, E, drift, time.
  // Readout spans are marked with data-readout="<index>" and collected once.
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cells: HTMLElement[] = [];
    rootRef.current?.querySelectorAll<HTMLElement>("[data-readout]").forEach((element) => {
      cells[Number(element.dataset.readout)] = element;
    });
    let frame = 0;
    const write = (index: number, text: string) => {
      const element = cells[index];
      if (element && element.textContent !== text) element.textContent = text;
    };
    const update = () => {
      if (frame++ % READOUT_INTERVAL !== 0) return;
      const k = runtime.kinematics;
      write(0, signed(k.x1));
      write(1, signed(k.y1));
      write(2, signed(k.x2));
      write(3, signed(k.y2));
      write(4, signed(k.vx1));
      write(5, signed(k.vy1));
      write(6, signed(k.vx2));
      write(7, signed(k.vy2));
      write(8, signed(k.ax1, 1));
      write(9, signed(k.ay1, 1));
      write(10, signed(k.ax2, 1));
      write(11, signed(k.ay2, 1));
      const e = runtime.energy;
      write(12, e.kinetic.toFixed(3));
      write(13, e.potential.toFixed(3));
      write(14, e.total.toFixed(3));
      write(
        15,
        runtime.initialEnergy > 1e-9
          ? (runtime.maxEnergyError / runtime.initialEnergy).toExponential(1)
          : "n/a",
      );
      write(16, runtime.time.toFixed(2));
    };
    return runtime.onFrame(update);
  }, [runtime]);

  return (
    <div ref={rootRef}>
    <SpotlightCard className="grid gap-x-8 gap-y-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section aria-label="Kinematics">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-white">Physics panel</h2>
          <p className="font-num text-xs text-muted-foreground">
            t = <span data-readout={16}>0.00</span> s
          </p>
        </header>
        <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-4 gap-y-2.5 text-xs">
          <span />
          <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Bob 1 <span className="tracking-normal normal-case opacity-70">(x, y)</span>
          </span>
          <span className="text-[11px] font-medium tracking-[0.14em] text-physics uppercase">
            Bob 2 <span className="tracking-normal normal-case opacity-70">(x, y)</span>
          </span>
          {ROWS.map((row, rowIndex) => (
            <div key={row.label} className="contents">
              <span className="text-muted-foreground">
                {row.label}
                <span className="ml-1 opacity-60">{row.unit}</span>
              </span>
              {[0, 1].map((bob) => (
                <span
                  key={bob}
                  className="font-num flex gap-3 rounded-md bg-white/[0.035] px-2.5 py-1.5 text-[13px] whitespace-pre text-white/90"
                >
                  <span data-readout={rowIndex * 4 + bob * 2} className="min-w-[3.4em]">
                    +0.00
                  </span>
                  <span data-readout={rowIndex * 4 + bob * 2 + 1} className="min-w-[3.4em]">
                    +0.00
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Energy" className="flex min-w-0 flex-col">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
          <h2 className="text-sm font-semibold tracking-tight text-white">Energy</h2>
          <dl className="font-num flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <EnergyLegend color={ENERGY_COLORS.kinetic} label="Kinetic">
              <span data-readout={12}>0.000</span>
            </EnergyLegend>
            <EnergyLegend color={ENERGY_COLORS.potential} label="Potential">
              <span data-readout={13}>0.000</span>
            </EnergyLegend>
            <EnergyLegend color={ENERGY_COLORS.total} label="Total">
              <span data-readout={14}>0.000</span>
            </EnergyLegend>
          </dl>
        </header>
        <div className="h-28 min-h-28 flex-1 overflow-hidden rounded-lg bg-black/25 ring-1 ring-white/5">
          <EnergyChart runtime={runtime} />
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">
          Largest drift of total energy this run, |E − E₀| / E₀:{" "}
          <span data-readout={15} className="font-num text-white/90">
            0.0e+0
          </span>
        </p>
      </section>
    </SpotlightCard>
    </div>
  );
}

function EnergyLegend({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />
      <dt className="font-sans text-muted-foreground">{label}</dt>
      <dd className="text-white/90">{children} J</dd>
    </div>
  );
}
