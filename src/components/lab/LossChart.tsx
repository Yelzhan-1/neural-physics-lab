"use client";

import { useEffect, useRef } from "react";

const NN = "#f5b942";
const PINN = "#b388ff";

/** Data-loss curves. Amber is the standard NN, violet is the PINN. */
export function LossChart({ nn, pinn }: { nn: number[]; pinn: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const top = 8;
    const bottom = height - 8;
    const left = 4;
    const right = width - 4;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let line = 0; line <= 3; line++) {
      const y = Math.round(top + ((bottom - top) * line) / 3) + 0.5;
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();

    const smooth = (series: number[]) => {
      const out: number[] = [];
      let acc = series.find((value) => Number.isFinite(value) && value > 0) ?? 1;
      for (const value of series) {
        if (!Number.isFinite(value) || value <= 0) {
          out.push(acc);
          continue;
        }
        acc = 0.18 * value + 0.82 * acc;
        out.push(acc);
      }
      return out;
    };
    const nnSmooth = smooth(nn);
    const pinnSmooth = smooth(pinn);
    const finite = [...nn, ...pinn, ...nnSmooth, ...pinnSmooth].filter(
      (value) => Number.isFinite(value) && value > 0,
    );
    if (finite.length === 0) return;
    const log = (value: number) => Math.log10(Math.max(value, 1e-5));
    let low = log(Math.min(...finite));
    let high = log(Math.max(...finite));
    if (high - low < 0.25) {
      const mid = (high + low) / 2;
      low = mid - 0.15;
      high = mid + 0.15;
    }
    const span = Math.max(nn.length, pinn.length, 2) - 1;

    const stroke = (series: number[], color: string, width: number, alpha: number) => {
      if (series.length === 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      let moved = false;
      for (let i = 0; i < series.length; i++) {
        const value = series[i];
        if (!Number.isFinite(value)) continue;
        const x = left + (i / span) * (right - left);
        const y = bottom - ((log(value) - low) / (high - low)) * (bottom - top);
        if (!moved) {
          ctx.moveTo(x, y);
          moved = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };
    stroke(nn, NN, 1, 0.28);
    stroke(pinn, PINN, 1, 0.28);
    stroke(nnSmooth, NN, 2.1, 1);
    stroke(pinnSmooth, PINN, 2.1, 1);
  }, [nn, pinn]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Smoothed data loss of the standard NN in amber and the PINN in violet, with the raw loss drawn faintly"
      data-testid="loss-chart"
      className="block h-full w-full"
    />
  );
}
