"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { formatMetric, type ResultRow } from "@/ml/results";

/** Log-scale bars of rollout MSE. Amber is the standard NN, violet is the PINN. */
export function MseChart({ rows }: { rows: ResultRow[] }) {
  const reduced = useReducedMotion();
  const [grown, setGrown] = useState(Boolean(reduced));
  useEffect(() => {
    if (reduced) return;
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [reduced, rows]);

  const values = rows.flatMap((row) => [row.nn.mse, row.pinn.mse]).filter((value) => value > 0);
  if (values.length === 0) return null;
  const floor = Math.min(...values) * 0.65;
  const ceil = Math.max(...values);
  const log = (value: number) => Math.log10(Math.max(value, floor));
  const span = Math.max(log(ceil) - log(floor), 0.2);
  const widthOf = (value: number) => `${Math.max(4, ((log(value) - log(floor)) / span) * 100)}%`;

  return (
    <div data-testid="mse-chart" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-white">Rollout MSE</h2>
        <p className="text-[11px] text-white/45">Log scale · state error, rad and rad/s</p>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white">{row.name}</p>
            <p className="truncate text-[11px] text-white/40">{row.setting}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Meter
              tone="bg-nn"
              width={grown ? widthOf(row.nn.mse) : "0%"}
              reduced={Boolean(reduced)}
              text={formatMetric(row.nn.mse)}
            />
            <Meter
              tone="bg-pinn"
              width={grown ? widthOf(row.pinn.mse) : "0%"}
              reduced={Boolean(reduced)}
              text={formatMetric(row.pinn.mse)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Meter({
  tone,
  width,
  reduced,
  text,
}: {
  tone: string;
  width: string;
  reduced: boolean;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width, transition: reduced ? "none" : "width 800ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </div>
      <span className="font-num w-14 text-right text-[11px] text-white/70">{text}</span>
    </div>
  );
}
