"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { DEFAULT_PARAMS, rk4Step } from "@/engine";

const COUNT = 50;
const BASE = 2.2;

function color(index: number): string {
  const t = index / (COUNT - 1);
  const r = Math.round(34 + (167 - 34) * t);
  const g = Math.round(211 + (139 - 211) * t);
  const b = Math.round(238 + (250 - 238) * t);
  return `rgb(${r} ${g} ${b})`;
}

/** Fifty double pendulums, each released 0.0001 rad further than the last. */
export function ChaosFan() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const params = { ...DEFAULT_PARAMS, damping: 0 };
    const states = Array.from({ length: COUNT }, (_, index) => new Float64Array([BASE + index * 1e-4, 0, 0, 0]));
    let frame = 0;
    let running = false;
    let visible = false;
    let last = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      context.clearRect(0, 0, w, h);
      const pivotX = w / 2;
      const pivotY = h * 0.22;
      const scale = Math.min(w, h) * 0.22;
      for (let index = 0; index < COUNT; index++) {
        const state = states[index];
        const x1 = pivotX + Math.sin(state[0]) * scale;
        const y1 = pivotY + Math.cos(state[0]) * scale;
        const x2 = x1 + Math.sin(state[1]) * scale;
        const y2 = y1 + Math.cos(state[1]) * scale;
        context.strokeStyle = color(index);
        context.globalAlpha = 0.85;
        context.lineWidth = 1.25;
        context.beginPath();
        context.moveTo(pivotX, pivotY);
        context.lineTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
        context.fillStyle = color(index);
        context.beginPath();
        context.arc(x2, y2, 2.2, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const stepAll = (elapsed: number) => {
      let left = Math.min(Math.max(elapsed, 0), 0.05);
      const sub = 1 / 240;
      while (left > 1e-5) {
        const dt = Math.min(sub, left);
        for (const state of states) rk4Step(state, params, dt, state);
        left -= dt;
      }
    };

    const loop = (now: number) => {
      if (!running) return;
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (visible && !reduced) stepAll(dt);
      draw();
      frame = requestAnimationFrame(loop);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const visibility = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !running && !reduced) {
          running = true;
          last = 0;
          frame = requestAnimationFrame(loop);
        }
        if (!visible && running) {
          running = false;
          cancelAnimationFrame(frame);
        }
      },
      { threshold: 0.15 },
    );
    visibility.observe(canvas);
    if (reduced) draw();

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
    };
  }, [reduced]);

  return (
    <section className="mx-auto w-full max-w-[1200px] px-5 py-8 sm:px-8" aria-label="Chaos fan">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
        <canvas ref={canvasRef} className="block h-[420px] w-full" />
      </div>
      <p className="mt-4 text-center text-sm text-white/70">
        Chaos: 50 pendulums, starting 0.0001 rad apart
      </p>
    </section>
  );
}
