"use client";

import { useEffect, useRef } from "react";

const NN = "#fb923c";
const PINN = "#a78bfa";

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

    const finite = [...nn, ...pinn].filter((value) => Number.isFinite(value) && value > 0);
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

    const stroke = (series: number[], color: string) => {
      if (series.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.7;
      ctx.lineJoin = "round";
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
    };
    stroke(nn, NN);
    stroke(pinn, PINN);
  }, [nn, pinn]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Data loss of the standard NN in amber and the PINN in violet"
      data-testid="loss-chart"
      className="block h-full w-full"
    />
  );
}
