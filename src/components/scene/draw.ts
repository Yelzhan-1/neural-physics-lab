import type { PendulumParams } from "@/engine";
import type { Trail } from "./runtime";

/*
 * Canvas primitives for the scene. Everything here draws in CSS pixels (the
 * caller sets the devicePixelRatio transform) and allocates nothing: dash
 * patterns and colours are module constants, coordinates stay in locals.
 */

export type SceneView = "pendulum" | "arm";

/** Where a pendulum sits on the canvas: pivot in pixels, pixels per metre. */
export interface Placement {
  pivotX: number;
  pivotY: number;
  scale: number;
  /** Multiplier for stroke widths and radii, so small cells stay delicate. */
  size: number;
}

const DASH_GHOST = [5, 7];
const DASH_GUIDE = [2, 8];
const DASH_NONE: number[] = [];
const TRAIL_BUCKETS = 24;
const TAU = Math.PI * 2;
const INK = "#060913";

/** Pre-rendered radial glow, so bobs get a halo without `shadowBlur`. */
export function createGlowSprite(rgb: string, size = 128): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, `rgba(${rgb}, 0.55)`);
    gradient.addColorStop(0.25, `rgba(${rgb}, 0.22)`);
    gradient.addColorStop(0.6, `rgba(${rgb}, 0.06)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return sprite;
}

/** Faint reach circle and pivot cross that frame each pendulum. */
export function drawGuides(
  ctx: CanvasRenderingContext2D,
  place: Placement,
  params: PendulumParams,
): void {
  const reach = (params.l1 + params.l2) * place.scale;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
  ctx.setLineDash(DASH_GUIDE);
  ctx.beginPath();
  ctx.arc(place.pivotX, place.pivotY, reach, 0, TAU);
  ctx.stroke();
  ctx.setLineDash(DASH_NONE);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
  ctx.beginPath();
  ctx.arc(place.pivotX, place.pivotY, params.l1 * place.scale, 0, TAU);
  ctx.moveTo(place.pivotX, place.pivotY);
  ctx.lineTo(place.pivotX, place.pivotY + reach);
  ctx.stroke();
  ctx.restore();
}

/** Fading, glowing path of the second bob. Oldest samples are faintest. */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: Trail,
  place: Placement,
  color: string,
  width: number,
): void {
  const count = trail.length;
  if (count < 2) return;
  const capacity = trail.capacity;
  const points = trail.points;
  const start = (trail.head - count + capacity) % capacity;
  const { pivotX, pivotY, scale } = place;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = pass === 0 ? width * 5 : width;
    const strength = pass === 0 ? 0.13 : 0.9;
    for (let bucket = 0; bucket < TRAIL_BUCKETS; bucket++) {
      // Buckets are fixed by age, so the fade does not shimmer as the ring fills.
      const newest = count - 1 - Math.floor((bucket * (capacity - 1)) / TRAIL_BUCKETS);
      const oldest = count - 1 - Math.floor(((bucket + 1) * (capacity - 1)) / TRAIL_BUCKETS);
      if (newest <= 0) break;
      const from = oldest < 0 ? 0 : oldest;
      const freshness = 1 - (bucket + 0.5) / TRAIL_BUCKETS;
      ctx.globalAlpha = freshness * freshness * strength;
      ctx.beginPath();
      for (let i = from; i <= newest; i++) {
        const index = ((start + i) % capacity) * 2;
        const x = pivotX + points[index] * scale;
        const y = pivotY - points[index + 1] * scale;
        if (i === from) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function bobRadius(mass: number, size: number): number {
  const radius = 5 + 4.5 * Math.sqrt(mass);
  return (radius > 16 ? 16 : radius) * size;
}

/** Classic view: thin rods, glowing bobs sized by mass. */
function drawPendulumBody(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  place: Placement,
  params: PendulumParams,
  color: string,
  glow: CanvasImageSource | null,
): void {
  const { pivotX, pivotY, size } = place;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(226, 232, 240, 0.78)";
  ctx.lineWidth = 1.6 * size;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.strokeStyle = "rgba(226, 232, 240, 0.7)";
  ctx.lineWidth = 1.4 * size;
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 4 * size, 0, TAU);
  ctx.fill();
  ctx.stroke();

  const r1 = bobRadius(params.m1, size);
  const r2 = bobRadius(params.m2, size);
  if (glow) {
    const previous = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glow, x1 - r1 * 3.2, y1 - r1 * 3.2, r1 * 6.4, r1 * 6.4);
    ctx.drawImage(glow, x2 - r2 * 4.2, y2 - r2 * 4.2, r2 * 8.4, r2 * 8.4);
    ctx.globalCompositeOperation = previous;
  }

  ctx.fillStyle = INK;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * size;
  ctx.beginPath();
  ctx.arc(x1, y1, r1, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x2, y2, r2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(x2 - r2 * 0.3, y2 - r2 * 0.3, r2 * 0.28, 0, TAU);
  ctx.fill();
}

function drawLinkCapsule(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  width: number,
  color: string,
): void {
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width + 3;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.stroke();
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.globalAlpha = alpha;
}

function drawJoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  ctx.fillStyle = INK;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.38, 0, TAU);
  ctx.fill();
}

/** Robot-arm view: mount, two capsule links, joints and a gripper. */
function drawArmBody(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  theta2: number,
  place: Placement,
  color: string,
  glow: CanvasImageSource | null,
): void {
  const { pivotX, pivotY, size } = place;

  // Ceiling mount above the shoulder joint.
  const plateY = pivotY - 26 * size;
  const plateHalf = 30 * size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
  ctx.lineWidth = 2 * size;
  ctx.beginPath();
  ctx.moveTo(pivotX - plateHalf, plateY);
  ctx.lineTo(pivotX + plateHalf, plateY);
  ctx.moveTo(pivotX - plateHalf * 0.55, plateY);
  ctx.lineTo(pivotX, pivotY);
  ctx.lineTo(pivotX + plateHalf * 0.55, plateY);
  ctx.stroke();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) {
    const x = pivotX + (i * plateHalf) / 3.5;
    ctx.moveTo(x, plateY);
    ctx.lineTo(x + 6 * size, plateY - 7 * size);
  }
  ctx.stroke();

  drawLinkCapsule(ctx, pivotX, pivotY, x1, y1, 13 * size, color);
  drawLinkCapsule(ctx, x1, y1, x2, y2, 9 * size, color);

  if (glow) {
    const previous = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    const span = 56 * size;
    ctx.drawImage(glow, x2 - span / 2, y2 - span / 2, span, span);
    ctx.globalCompositeOperation = previous;
  }

  // Gripper, aligned with the forearm. Local +x points away from the elbow.
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(Math.PI / 2 - theta2);
  const reach = 17 * size;
  const open = 8 * size;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.6 * size;
  ctx.beginPath();
  ctx.moveTo(3 * size, -open);
  ctx.lineTo(3 * size, open);
  ctx.moveTo(3 * size, -open);
  ctx.lineTo(reach, -open);
  ctx.lineTo(reach, -open * 0.45);
  ctx.moveTo(3 * size, open);
  ctx.lineTo(reach, open);
  ctx.lineTo(reach, open * 0.45);
  ctx.stroke();
  ctx.restore();

  drawJoint(ctx, pivotX, pivotY, 9 * size, color);
  drawJoint(ctx, x1, y1, 7.5 * size, color);
  drawJoint(ctx, x2, y2, 5 * size, color);
}

/** Draws one pendulum (or arm) for the given angles. */
export function drawBody(
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  theta1: number,
  theta2: number,
  place: Placement,
  params: PendulumParams,
  color: string,
  glow: CanvasImageSource | null,
): void {
  const x1 = place.pivotX + params.l1 * Math.sin(theta1) * place.scale;
  const y1 = place.pivotY + params.l1 * Math.cos(theta1) * place.scale;
  const x2 = x1 + params.l2 * Math.sin(theta2) * place.scale;
  const y2 = y1 + params.l2 * Math.cos(theta2) * place.scale;
  if (view === "arm") {
    drawArmBody(ctx, x1, y1, x2, y2, theta2, place, color, glow);
  } else {
    drawPendulumBody(ctx, x1, y1, x2, y2, place, params, color, glow);
  }
}

/**
 * Placeholder for a slot without a trajectory: a dashed outline at the
 * release pose that breathes slowly, and a rotating dashed reach ring.
 */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  theta1: number,
  theta2: number,
  place: Placement,
  params: PendulumParams,
  color: string,
  seconds: number,
): void {
  const { pivotX, pivotY, scale, size } = place;
  const x1 = pivotX + params.l1 * Math.sin(theta1) * scale;
  const y1 = pivotY + params.l1 * Math.cos(theta1) * scale;
  const x2 = x1 + params.l2 * Math.sin(theta2) * scale;
  const y2 = y1 + params.l2 * Math.cos(theta2) * scale;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.setLineDash(DASH_GHOST);

  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.lineDashOffset = -seconds * 9;
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, (params.l1 + params.l2) * scale, 0, TAU);
  ctx.stroke();

  ctx.globalAlpha = 0.5 + 0.18 * Math.sin(seconds * 1.6);
  ctx.lineWidth = 1.5 * size;
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x1, y1, bobRadius(params.m1, size), 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x2, y2, bobRadius(params.m2, size), 0, TAU);
  ctx.stroke();
  ctx.setLineDash(DASH_NONE);
  ctx.restore();
}

/** Ring drawn around a bob the pointer can grab or is holding. */
export function drawGrabRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  held: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = held ? 0.9 : 0.5;
  ctx.lineWidth = held ? 2 : 1.2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
