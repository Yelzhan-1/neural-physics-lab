"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import raw from "../../../public/results.json";
import { formatMetric, type ResultRow, type ResultsFile } from "@/ml/results";

const results = raw as unknown as ResultsFile;

const BARS: { id: string; label: string }[] = [
  { id: "E1", label: "E1 full" },
  { id: "E2-5", label: "E2 5%" },
  { id: "E3", label: "E3 unseen" },
  { id: "E4-10", label: "E4 10 s" },
];

function rowOf(id: string): ResultRow | undefined {
  return results.rows.find((row) => row.id === id);
}

function useCountUp(target: number): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      const eased = 1 - (1 - t) ** 3;
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, target]);
  return reduced ? target : value;
}

/** Compact landing strip. Every number is read from the committed results file. */
export function ResultsStrip() {
  const reduced = useReducedMotion();
  const [grown, setGrown] = useState(Boolean(reduced));
  const limited = rowOf("E2-5");
  const ratio = limited ? limited.nn.mse / Math.max(limited.pinn.mse, 1e-12) : 1;
  const pinnWinsLimited = limited ? limited.winner !== "nn" : false;
  const shown = useCountUp(pinnWinsLimited ? ratio : limited ? limited.pinn.mse / Math.max(limited.nn.mse, 1e-12) : 1);

  useEffect(() => {
    if (reduced) return;
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  if (!limited) return null;
  const values = BARS.flatMap((bar) => {
    const row = rowOf(bar.id);
    return row ? [row.nn.mse, row.pinn.mse] : [];
  }).filter((value) => value > 0);
  const floor = Math.min(...values) * 0.7;
  const ceil = Math.max(...values);
  const log = (value: number) => Math.log10(Math.max(value, floor));
  const span = Math.max(log(ceil) - log(floor), 0.2);
  const widthOf = (value: number) => `${Math.max(6, ((log(value) - log(floor)) / span) * 100)}%`;

  return (
    <section
      data-testid="results-strip"
      className="mx-auto w-full max-w-[1100px] px-5 pb-16 sm:px-8"
    >
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-physics uppercase">From the committed run</p>
            <p className="mt-3 text-2xl leading-tight font-semibold tracking-tight text-balance text-white sm:text-3xl">
              {pinnWinsLimited ? (
                <>
                  With 5% of the data, PINN error is{" "}
                  <span className="font-num text-pinn">{shown.toFixed(1)}×</span> lower
                </>
              ) : (
                <>
                  With 5% of the data, the standard NN error is{" "}
                  <span className="font-num text-nn">{shown.toFixed(1)}×</span> lower
                </>
              )}
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
              Rollout MSE on held-out trajectories, state error in radians and rad/s.{" "}
              {formatMetric(limited.nn.mse)} for the standard NN, {formatMetric(limited.pinn.mse)} for the PINN.
            </p>
            <Link
              href="/experiments"
              className="mt-4 inline-flex text-sm font-medium text-white/80 transition-colors hover:text-white"
            >
              See the full table
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {BARS.map((bar) => {
              const row = rowOf(bar.id);
              if (!row) return null;
              return (
                <div key={bar.id} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                  <span className="text-[11px] tracking-wide text-white/50 uppercase">{bar.label}</span>
                  <div className="flex flex-col gap-1">
                    <Bar
                      color="bg-nn"
                      width={grown ? widthOf(row.nn.mse) : "0%"}
                      reduced={Boolean(reduced)}
                      label={`${formatMetric(row.nn.mse)} NN`}
                    />
                    <Bar
                      color="bg-pinn"
                      width={grown ? widthOf(row.pinn.mse) : "0%"}
                      reduced={Boolean(reduced)}
                      label={`${formatMetric(row.pinn.mse)} PINN`}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-white/40">Log-scale rollout MSE. Amber is the standard NN, violet is the PINN.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Bar({
  color,
  width,
  reduced,
  label,
}: {
  color: string;
  width: string;
  reduced: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full ${color}`}
          style={{
            width,
            transition: reduced ? "none" : "width 900ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </div>
      <span className="font-num w-16 text-right text-[10px] text-white/55">{label}</span>
    </div>
  );
}
