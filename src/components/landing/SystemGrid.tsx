"use client";

import {
  DEFAULT_ORBITAL,
  DEFAULT_PARAMS,
  DEFAULT_PROJECTILE,
  DEFAULT_SPRING,
  orbitalLaunch,
  orbitalRk4,
  projectileLaunch,
  projectileRk4,
  rk4Step,
  springRk4,
} from "@/engine";
import { SYSTEMS } from "@/ml/systems";
import Link from "next/link";
import { useEffect, useRef } from "react";

const PHYSICS = "#ede6da";
const PINN = "#c8f04a";
const STEP = 0.02;
const CAPACITY = 280;

interface Point {
  x: number;
  y: number;
  reset?: boolean;
}

interface World {
  id: string;
  advance: (dt: number) => Point;
  bone: Point[];
  lime: Point[];
  cursor: number;
}

const HREF: Record<string, string> = {
  "double-pendulum": "/lab?system=double-pendulum",
  "spring-mass": "/lab?system=spring-mass",
  projectile: "/lab?system=projectile",
  orbital: "/lab?system=orbital",
};

/** Four live RK4 sketches. Bone is the engine. Lime is the pretrained PINN rollout. */
export function SystemGrid() {
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    const worlds = createWorlds();
    let stopped = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const paint = () => {
      worlds.forEach((world, index) => {
        const canvas = refs.current[index];
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawMini(context, rect.width, rect.height, world);
      });
    };

    if (reduced) {
      for (let i = 0; i < 220; i++) {
        for (const world of worlds) push(world, world.advance(STEP));
      }
      paint();
    }

    void loadPinn().then((traces) => {
      if (stopped) return;
      for (const world of worlds) world.lime = traces[world.id] ?? [];
      if (reduced) paint();
    });

    if (reduced) {
      return () => {
        stopped = true;
      };
    }

    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const substeps = Math.max(1, Math.round(dt / STEP));
      const slice = dt / substeps;
      for (let i = 0; i < substeps; i++) {
        for (const world of worlds) push(world, world.advance(slice));
      }
      paint();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3">
      {SYSTEMS.map((system, index) => (
        <Link
          key={system.id}
          href={HREF[system.id] ?? "/lab"}
          data-testid={`mini-${system.id}`}
          aria-label={`${system.name} preview`}
          className="block overflow-hidden rounded-[10px] border border-hairline bg-panel transition-colors hover:border-foreground/30"
        >
          <canvas
            ref={(node) => {
              refs.current[index] = node;
            }}
            className="block h-28 w-full lg:aspect-[5/4] lg:h-auto"
          />
          <span className="flex items-baseline justify-between gap-2 border-t border-hairline px-2.5 py-1.5 font-num text-[10px] leading-snug tracking-[0.12em] text-muted-foreground uppercase">
            <span aria-hidden="true">{system.code}</span>
            <span className="text-right">{system.name}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function push(world: World, point: Point) {
  if (point.reset) world.bone = [];
  world.bone.push(point);
  if (world.bone.length > CAPACITY) world.bone.shift();
  world.cursor += 1;
}

function createWorlds(): World[] {
  const pendulum = new Float64Array([2.2, 2, 0, 0]);
  const spring = new Float64Array([0.65, 0]);
  let springTime = 0;
  const shot = projectileLaunch(DEFAULT_PROJECTILE);
  const orbit = orbitalLaunch(DEFAULT_ORBITAL);

  return [
    {
      id: "double-pendulum",
      bone: [],
      lime: [],
      cursor: 0,
      advance: (dt) => {
        rk4Step(pendulum, DEFAULT_PARAMS, dt, pendulum);
        const x1 = Math.sin(pendulum[0]);
        const y1 = -Math.cos(pendulum[0]);
        return { x: x1 + Math.sin(pendulum[1]), y: y1 - Math.cos(pendulum[1]) };
      },
    },
    {
      id: "spring-mass",
      bone: [],
      lime: [],
      cursor: 0,
      advance: (dt) => {
        springTime = springRk4(spring, DEFAULT_SPRING, springTime, dt, spring);
        return { x: spring[0], y: spring[1] };
      },
    },
    {
      id: "projectile",
      bone: [],
      lime: [],
      cursor: 0,
      advance: (dt) => {
        projectileRk4(shot, DEFAULT_PROJECTILE, dt, shot);
        if (shot[1] < 0 && shot[3] < 0) {
          projectileLaunch(DEFAULT_PROJECTILE, shot);
          return { x: 0, y: 0, reset: true };
        }
        return { x: shot[0], y: Math.max(0, shot[1]) };
      },
    },
    {
      id: "orbital",
      bone: [],
      lime: [],
      cursor: 0,
      advance: (dt) => {
        orbitalRk4(orbit, DEFAULT_ORBITAL, dt, orbit);
        return { x: orbit[0], y: orbit[1] };
      },
    },
  ];
}

async function loadPinn(): Promise<Record<string, Point[]>> {
  const ids = ["double-pendulum", "spring-mass", "projectile", "orbital"] as const;
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const response = await fetch(`/models/${id}/demo-rollout.json`);
        if (!response.ok) return [id, [] as Point[]] as const;
        const data = (await response.json()) as { pinn?: number[] };
        return [id, subsample(id, data.pinn ?? [])] as const;
      } catch {
        return [id, [] as Point[]] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

function subsample(id: string, raw: number[]): Point[] {
  const width = id === "spring-mass" ? 2 : 4;
  const stride = width * 3;
  const points: Point[] = [];
  for (let i = 0; i + width <= raw.length; i += stride) {
    if (id === "double-pendulum") {
      const x1 = Math.sin(raw[i]);
      const y1 = -Math.cos(raw[i]);
      points.push({ x: x1 + Math.sin(raw[i + 1]), y: y1 - Math.cos(raw[i + 1]) });
    } else if (id === "spring-mass") {
      points.push({ x: raw[i], y: raw[i + 1] });
    } else {
      points.push({ x: raw[i], y: raw[i + 1] });
    }
  }
  return points;
}

function limeWindow(world: World): Point[] {
  const count = world.lime.length;
  if (count < 2) return [];
  const head = world.cursor % count;
  const span = Math.min(72, count);
  const start = (head - span + count) % count;
  if (start < head) return world.lime.slice(start, head);
  return world.lime.slice(start).concat(world.lime.slice(0, head));
}

function drawMini(context: CanvasRenderingContext2D, width: number, height: number, world: World) {
  context.clearRect(0, 0, width, height);
  const lime = limeWindow(world);
  const points = world.bone.concat(lime);
  if (points.length < 2) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(0.15, maxX - minX);
  const spanY = Math.max(0.15, maxY - minY);
  const scale = Math.min((width * 0.72) / spanX, (height * 0.72) / spanY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const map = (point: Point) => ({
    x: width / 2 + (point.x - midX) * scale,
    y: height / 2 - (point.y - midY) * scale,
  });
  stroke(context, world.bone, map, PHYSICS, 1.6);
  if (lime.length > 1) stroke(context, lime, map, PINN, 1.35);
  const head = world.bone[world.bone.length - 1];
  if (head) {
    const at = map(head);
    context.fillStyle = PHYSICS;
    context.beginPath();
    context.arc(at.x, at.y, 2.4, 0, Math.PI * 2);
    context.fill();
  }
}

function stroke(
  context: CanvasRenderingContext2D,
  points: Point[],
  map: (point: Point) => Point,
  color: string,
  width: number,
) {
  context.beginPath();
  points.forEach((point, index) => {
    const at = map(point);
    if (index === 0) context.moveTo(at.x, at.y);
    else context.lineTo(at.x, at.y);
  });
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
}
