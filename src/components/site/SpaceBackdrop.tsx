"use client";

import { useEffect, useRef } from "react";

const STAR_STRIDE = 4;

/**
 * Fixed page backdrop: nebula washes, a drifting grid and a slow starfield.
 * Stars live in one Float32Array (x, y, depth, phase) and are redrawn in
 * place, so the loop allocates nothing.
 */
export function SpaceBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let stars = new Float32Array(0);
    let frame = 0;
    let last = performance.now();

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const count = Math.min(220, Math.round((width * height) / 9000));
      stars = new Float32Array(count * STAR_STRIDE);
      for (let i = 0; i < count; i++) {
        stars[i * STAR_STRIDE] = Math.random() * width;
        stars[i * STAR_STRIDE + 1] = Math.random() * height;
        stars[i * STAR_STRIDE + 2] = 0.25 + Math.random() * 0.75;
        stars[i * STAR_STRIDE + 3] = Math.random() * Math.PI * 2;
      }
    };

    const draw = (now: number) => {
      const elapsed = Math.min((now - last) / 1000, 0.05);
      last = now;
      const seconds = now / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#dbeafe";
      for (let i = 0; i < stars.length; i += STAR_STRIDE) {
        const depth = stars[i + 2];
        let y = stars[i + 1] - elapsed * depth * 5;
        if (y < -2) y = height + 2;
        stars[i + 1] = y;
        const twinkle = 0.55 + 0.45 * Math.sin(seconds * (0.4 + depth) + stars[i + 3]);
        ctx.globalAlpha = depth * 0.6 * twinkle;
        const size = depth * 1.6;
        ctx.fillRect(stars[i], y, size, size);
      }
      ctx.globalAlpha = 1;
      if (!reduceMotion) frame = requestAnimationFrame(draw);
    };

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="space-nebula absolute inset-0" />
      <div className="space-grid absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
