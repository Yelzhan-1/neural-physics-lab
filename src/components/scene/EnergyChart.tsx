"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { EnergyHistory, HISTORY_STRIDE, type LabRuntime } from "./runtime";

export const ENERGY_COLORS = {
  kinetic: "#5eead4",
  potential: "#f472b6",
  total: "#f8fafc",
} as const;

const SERIES_COLORS = [ENERGY_COLORS.kinetic, ENERGY_COLORS.potential, ENERGY_COLORS.total];
const STRIDE = EnergyHistory.STRIDE;

/**
 * Scrolling plot of kinetic, potential and total energy of the physics slot,
 * read straight from the runtime's ring buffer. A flat total line is the
 * visual proof that the integrator conserves energy.
 */
export function EnergyChart({ runtime, className }: { runtime: LabRuntime; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      if (width === 0 || height === 0) return;
      const history = runtime.history;
      const samples = history.samples;
      const count = history.length;
      const capacity = history.capacity;
      const start = (history.head - count + capacity) % capacity;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const top = 6;
      const bottom = height - 6;
      ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let line = 0; line <= 3; line++) {
        const y = Math.round(top + ((bottom - top) * line) / 3) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
      if (count < 2) return;

      let peak = runtime.initialEnergy;
      for (let i = 0; i < count; i++) {
        const offset = ((start + i) % capacity) * STRIDE;
        if (samples[offset + 1] > peak) peak = samples[offset + 1];
        if (samples[offset + 2] > peak) peak = samples[offset + 2];
        if (samples[offset + 3] > peak) peak = samples[offset + 3];
      }
      const ceiling = peak > 1e-9 ? peak * 1.15 : 1;

      // The window is as long as a full buffer, so the plot fills left to right
      // and then scrolls.
      const span = capacity * runtime.dt * HISTORY_STRIDE;
      const newest = samples[((start + count - 1) % capacity) * STRIDE];
      const origin = newest > span ? newest - span : 0;

      ctx.lineJoin = "round";
      for (let series = 0; series < 3; series++) {
        ctx.strokeStyle = SERIES_COLORS[series];
        ctx.lineWidth = series === 2 ? 2 : 1.4;
        ctx.globalAlpha = series === 2 ? 1 : 0.9;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const offset = ((start + i) % capacity) * STRIDE;
          const x = ((samples[offset] - origin) / span) * width;
          const y = bottom - (samples[offset + 1 + series] / ceiling) * (bottom - top);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const unsubscribe = runtime.onFrame(draw);
    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, [runtime]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Kinetic, potential and total energy over time"
      data-testid="energy-chart"
      className={cn("block h-full w-full", className)}
    />
  );
}
