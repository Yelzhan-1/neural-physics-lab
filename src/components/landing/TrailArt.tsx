"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_DT, DEFAULT_PARAMS, rk4Step, simulate } from "@/engine";
import { DEMO_ROLLOUT_URL } from "@/ml/constants";

type Point = { x: number; y: number; x1?: number; y1?: number };

const PHYSICS = "#ede6da";
const NN = "#ff6a3d";
const PINN = "#c8f04a";

/** One luminous RK4 exposure, plus the committed NN and PINN rollouts of the demo pose. */
export function TrailArt({
  mode,
  testId,
  label,
}: {
  mode: "chaos" | "nn" | "pinn";
  testId?: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let stopped = false;

    const bundle = mode === "chaos" ? chaosBundle() : null;
    let physics: Point[] = [];
    let nn: Point[] = [];
    let pinn: Point[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const paint = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      context.clearRect(0, 0, rect.width, rect.height);
      if (mode === "chaos" && bundle) {
        const length = bundle[0]?.length ?? 1;
        const index = reduced ? Math.floor(length * 0.72) : (Math.floor((now / 1000) * 42) + 220) % length;
        drawChaos(context, bundle, index, rect.width, rect.height);
      } else if (physics.length > 1) {
        const length = physics.length;
        const index = reduced ? Math.floor(length * 0.55) : Math.floor((now / 1000) * 28) % length;
        const emphasis = mode === "pinn" ? "pinn" : "nn";
        drawCompare(context, physics, emphasis === "nn" ? nn : pinn, emphasis, index, rect.width, rect.height);
      }
    };

    resize();
    paint(0);
    const onResize = () => {
      resize();
      paint(performance.now());
    };
    window.addEventListener("resize", onResize);

    if (mode !== "chaos") {
      void loadCompare().then((loaded) => {
        if (stopped) return;
        physics = loaded.physics;
        nn = loaded.nn;
        pinn = loaded.pinn;
        paint(performance.now());
      });
    }

    const loop = (now: number) => {
      paint(now);
      frame = requestAnimationFrame(loop);
    };
    if (!reduced) frame = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={testId}
      role="img"
      aria-label={label}
      className="block h-full w-full"
    />
  );
}

function tip(theta1: number, theta2: number): Point {
  const x1 = Math.sin(theta1);
  const y1 = -Math.cos(theta1);
  return {
    x1,
    y1,
    x: x1 + Math.sin(theta2),
    y: y1 - Math.cos(theta2),
  };
}

let bundleCache: Point[][] | null = null;

function chaosBundle(): Point[][] {
  if (bundleCache) return bundleCache;
  const seconds = 8;
  const steps = Math.round(seconds / DEFAULT_DT);
  const stride = 4;
  const paths: Point[][] = [];
  for (let n = -6; n <= 6; n++) {
    const trajectory = simulate([2.8 + n * 0.0014, 2.1, 0, 0], DEFAULT_PARAMS, steps);
    const path: Point[] = [];
    for (let i = 0; i <= steps; i += stride) {
      path.push(tip(trajectory[i * 4], trajectory[i * 4 + 1]));
    }
    paths.push(path);
  }
  bundleCache = paths;
  return paths;
}

async function loadCompare(): Promise<{ physics: Point[]; nn: Point[]; pinn: Point[] }> {
  const response = await fetch(DEMO_ROLLOUT_URL);
  if (!response.ok) return { physics: [], nn: [], pinn: [] };
  const data = (await response.json()) as { nn: number[]; pinn: number[]; theta1: number; theta2: number };
  const count = Math.floor(data.nn.length / 4);
  const state = new Float64Array([(data.theta1 * Math.PI) / 180, (data.theta2 * Math.PI) / 180, 0, 0]);
  const physics: Point[] = [];
  for (let i = 0; i < count; i++) {
    physics.push(tip(state[0], state[1]));
    rk4Step(state, DEFAULT_PARAMS, 0.02, state);
  }
  return { physics, nn: flatTips(data.nn), pinn: flatTips(data.pinn) };
}

function flatTips(flat: number[]): Point[] {
  const path: Point[] = [];
  for (let i = 0; i < flat.length; i += 4) path.push(tip(flat[i], flat[i + 1]));
  return path;
}

function drawChaos(
  context: CanvasRenderingContext2D,
  paths: Point[][],
  index: number,
  width: number,
  height: number,
) {
  const { scale, originX, originY } = frame(paths, width, height);
  const history = 280;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (let i = 0; i < paths.length; i++) {
    if (i === Math.floor(paths.length / 2)) continue;
    stroke(context, paths[i], index - history, index, originX, originY, scale, "rgba(237,230,218,0.28)", 1.05);
  }
  const main = paths[Math.floor(paths.length / 2)];
  stroke(context, main, index - history, index, originX, originY, scale, "rgba(237,230,218,0.16)", 7);
  stroke(context, main, index - history, index, originX, originY, scale, "rgba(237,230,218,0.9)", 1.35);
  stroke(context, main, index - 36, index, originX, originY, scale, "#c8f04a", 1.7);
  const pose = main[Math.min(main.length - 1, Math.max(0, index))];
  if (!pose) return;
  const jointX = pose.x1 ?? pose.x * 0.5;
  const jointY = pose.y1 ?? pose.y * 0.5;
  context.strokeStyle = "#ede6da";
  context.lineWidth = 2.2;
  context.beginPath();
  context.moveTo(originX, originY);
  context.lineTo(originX + jointX * scale, originY - jointY * scale);
  context.lineTo(originX + pose.x * scale, originY - pose.y * scale);
  context.stroke();
  const joints = [
    [0, 0, 4, "#ede6da"],
    [jointX, jointY, 4.5, "#ede6da"],
    [pose.x, pose.y, 6, "#c8f04a"],
  ] as const;
  for (const [x, y, radius, fill] of joints) {
    context.fillStyle = fill;
    context.beginPath();
    context.arc(originX + x * scale, originY - y * scale, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function frame(paths: Point[][], width: number, height: number) {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const path of paths) {
    for (const point of path) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  const pad = 28;
  const spanX = Math.max(0.2, maxX - minX);
  const spanY = Math.max(0.2, maxY - minY);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  return {
    scale,
    originX: (width - spanX * scale) / 2 - minX * scale,
    originY: (height - spanY * scale) / 2 + maxY * scale,
  };
}

function drawCompare(
  context: CanvasRenderingContext2D,
  physics: Point[],
  model: Point[],
  mode: "nn" | "pinn",
  index: number,
  width: number,
  height: number,
) {
  const { scale, originX, originY } = frame([physics, model], width, height);
  const color = mode === "nn" ? NN : PINN;
  context.lineCap = "round";
  context.lineJoin = "round";
  stroke(context, physics, 0, index, originX, originY, scale, "rgba(237,230,218,0.85)", 1.6);
  stroke(context, model, 0, index, originX, originY, scale, color, 2.1);
  const truth = physics[Math.min(physics.length - 1, index)];
  const guess = model[Math.min(model.length - 1, Math.max(0, index))];
  if (truth) dot(context, originX + truth.x * scale, originY - truth.y * scale, PHYSICS);
  if (guess) dot(context, originX + guess.x * scale, originY - guess.y * scale, color);
}

function stroke(
  context: CanvasRenderingContext2D,
  path: Point[],
  start: number,
  end: number,
  originX: number,
  originY: number,
  scale: number,
  color: string,
  width: number,
) {
  const first = Math.max(0, start);
  const last = Math.min(path.length - 1, end);
  if (last - first < 1) return;
  context.beginPath();
  for (let i = first; i <= last; i++) {
    const point = path[i];
    const x = originX + point.x * scale;
    const y = originY - point.y * scale;
    if (i === first) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

function dot(context: CanvasRenderingContext2D, x: number, y: number, color: string) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, 5, 0, Math.PI * 2);
  context.fill();
}
