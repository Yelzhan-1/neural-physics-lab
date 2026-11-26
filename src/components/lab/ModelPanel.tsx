"use client";

import { useEffect, useRef } from "react";
import { energy } from "@/engine";
import { SLOTS, type LabRuntime } from "@/components/scene/runtime";

const COLORS = [SLOTS[0].color, SLOTS[1].color, SLOTS[2].color];

function tip(state: ArrayLike<number>, l1: number, l2: number): { x: number; y: number } {
  return {
    x: l1 * Math.sin(state[0]) + l2 * Math.sin(state[1]),
    y: -l1 * Math.cos(state[0]) - l2 * Math.cos(state[1]),
  };
}

function tipError(runtime: LabRuntime, slot: number): number {
  const { l1, l2 } = runtime.params;
  const truth = tip(runtime.states[0], l1, l2);
  const guess = tip(runtime.states[slot], l1, l2);
  return Math.hypot(truth.x - guess.x, truth.y - guess.y);
}

/** Tip error and total energy of physics, the standard NN and the PINN. */
export function ModelPanel({ runtime, slotsReady = false }: { runtime: LabRuntime; slotsReady?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cells: HTMLElement[] = [];
    rootRef.current?.querySelectorAll<HTMLElement>("[data-model]").forEach((element) => {
      cells[Number(element.dataset.model)] = element;
    });
    const write = (index: number, text: string) => {
      const element = cells[index];
      if (element && element.textContent !== text) element.textContent = text;
    };
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (canvas) observer.observe(canvas);

    let frame = 0;
    const draw = () => {
      if (frame++ % 6 === 0) {
        const initial = runtime.initialEnergy;
        for (const slot of [1, 2]) {
          const base = (slot - 1) * 2;
          if (!runtime.active[slot]) {
            write(base, "—");
            write(base + 1, "—");
            continue;
          }
          write(base, `${tipError(runtime, slot).toFixed(3)} m`);
          const total = energy(runtime.states[slot], runtime.params).total;
          write(
            base + 1,
            initial > 1e-9 ? (Math.abs(total - initial) / initial).toExponential(1) : "n/a",
          );
        }
      }
      if (!ctx || width === 0 || height === 0) return;
      const history = runtime.comparison;
      const samples = history.samples;
      const count = history.length;
      const capacity = history.capacity;
      const start = (history.head - count + capacity) % capacity;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const top = 8;
      const bottom = height - 8;
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

      let low = Number.POSITIVE_INFINITY;
      let high = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < count; i++) {
        const offset = ((start + i) % capacity) * 4;
        for (let series = 1; series <= 3; series++) {
          const value = samples[offset + series];
          if (!Number.isFinite(value)) continue;
          if (value < low) low = value;
          if (value > high) high = value;
        }
      }
      if (!Number.isFinite(low) || high - low < 1e-4) {
        const mid = Number.isFinite(low) ? low : 0;
        low = mid - 0.5;
        high = mid + 0.5;
      } else {
        const pad = (high - low) * 0.12;
        low -= pad;
        high += pad;
      }
      const span = capacity * runtime.dt * 4;
      const newest = samples[((start + count - 1) % capacity) * 4];
      const origin = newest > span ? newest - span : 0;

      ctx.lineJoin = "round";
      for (let series = 0; series < 3; series++) {
        ctx.strokeStyle = COLORS[series];
        ctx.lineWidth = series === 0 ? 1.7 : 1.5;
        ctx.beginPath();
        let moved = false;
        for (let i = 0; i < count; i++) {
          const offset = ((start + i) % capacity) * 4;
          const value = samples[offset + 1 + series];
          if (!Number.isFinite(value)) {
            moved = false;
            continue;
          }
          const x = ((samples[offset] - origin) / span) * width;
          const y = bottom - ((value - low) / (high - low)) * (bottom - top);
          if (!moved) {
            ctx.moveTo(x, y);
            moved = true;
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    const unsubscribe = runtime.onFrame(draw);
    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, [runtime]);

  return (
    <div ref={rootRef} className="grid gap-3">
      <div>
        <p className="font-num text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Tip error</p>
        <div className="mt-1 grid gap-1">
          {[1, 2].map((slot) => (
            <p
              key={slot}
              data-testid={slot === 1 ? "slot-nn" : "slot-pinn"}
              data-active={slotsReady ? "true" : "false"}
              className="flex items-baseline justify-between font-num text-[12px]"
              style={{ color: COLORS[slot] }}
            >
              <span>{slot === 1 ? "NN" : "PINN"}</span>
              <span data-model={(slot - 1) * 2}>—</span>
            </p>
          ))}
        </div>
      </div>
      <div>
        <p className="font-num text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Energy drift</p>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Total energy of the physics solver, the standard NN and the PINN"
          data-testid="model-energy-chart"
          className="mt-1 block h-16 w-full"
        />
        <div className="mt-1 grid gap-1">
          {[1, 2].map((slot) => (
            <p
              key={slot}
              className="flex items-baseline justify-between font-num text-[12px]"
              style={{ color: COLORS[slot] }}
            >
              <span>{slot === 1 ? "NN" : "PINN"}</span>
              <span data-model={(slot - 1) * 2 + 1}>—</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
