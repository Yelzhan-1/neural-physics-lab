"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  createGlowSprite,
  drawBody,
  drawGhost,
  drawGrabRing,
  drawGuides,
  drawTrail,
  type Placement,
  type SceneView,
} from "./draw";
import { PHYSICS_SLOT, SLOT_COUNT, SLOTS, type LabRuntime, type SlotId } from "./runtime";

export type SceneLayout = "split" | "overlay";

export interface PendulumSceneProps {
  runtime: LabRuntime;
  view?: SceneView;
  /** "split" gives every slot its own cell, "overlay" draws them on one pivot. */
  layout?: SceneLayout;
  /** Slots to show, in display order. Defaults to all three. */
  slots?: readonly SlotId[];
  /** Lets the user drag the bobs of the physics pendulum. */
  interactive?: boolean;
  showLabels?: boolean;
  showGuides?: boolean;
  /** Scales the pendulum relative to the size that fits its cell. */
  zoom?: number;
  /** Vertical position of the pivot inside its cell, 0 (top) to 1 (bottom). */
  pivotY?: number;
  trailWidth?: number;
  /** Called while a bob is dragged, with the new release angles in radians. */
  onAnglesChange?: (theta1: number, theta2: number) => void;
  className?: string;
  ariaLabel?: string;
}

const ALL_SLOTS: readonly SlotId[] = SLOTS.map((slot) => slot.id);
const UNTRAINED_TITLE = "Model not trained yet";
const UNTRAINED_HINT = "Its prediction will play here";
const UNTRAINED_LEGEND = SLOTS.map((slot) => `${slot.label}  ·  not trained yet`);
const DRAG_HINT = "Drag a bob to set the starting pose";
const GRAB_RADIUS = 30;
/** Below this canvas width the split layout stacks instead of using columns. */
const STACK_BREAKPOINT = 640;
const CELL_STRIDE = 4;
const LEAD_COLUMN_WEIGHT = 1.45;

interface Settings {
  view: SceneView;
  layout: SceneLayout;
  slots: readonly SlotId[];
  interactive: boolean;
  showLabels: boolean;
  showGuides: boolean;
  zoom: number;
  pivotY: number;
  trailWidth: number;
  onAnglesChange?: (theta1: number, theta2: number) => void;
}

/**
 * Canvas view of a `LabRuntime`. It owns no simulation state: every frame it
 * reads the runtime's buffers and repaints, so anything that can fill those
 * buffers (the RK4 engine today, model predictions in Step B) can drive it.
 */
export function PendulumScene({
  runtime,
  view = "pendulum",
  layout = "split",
  slots = ALL_SLOTS,
  interactive = false,
  showLabels = true,
  showGuides = true,
  zoom = 1,
  pivotY = 0.47,
  trailWidth = 1.8,
  onAnglesChange,
  className,
  ariaLabel = "Double pendulum simulation",
}: PendulumSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef<Settings | null>(null);

  useEffect(() => {
    settingsRef.current = {
      view,
      layout,
      slots,
      interactive,
      showLabels,
      showGuides,
      zoom,
      pivotY,
      trailWidth,
      onAnglesChange,
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const family = getComputedStyle(document.body).fontFamily || "sans-serif";
    const labelFont = `600 12px ${family}`;
    const titleFont = `500 13px ${family}`;
    const hintFont = `400 11.5px ${family}`;
    const glows = SLOTS.map((slot) => createGlowSprite(slot.rgb));

    // Per-frame scratch, allocated once.
    const cells = new Float32Array(SLOT_COUNT * CELL_STRIDE);
    const place: Placement = { pivotX: 0, pivotY: 0, scale: 1, size: 1 };
    const physicsPlace: Placement = { pivotX: 0, pivotY: 0, scale: 1, size: 1 };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let visible = true;
    let hoverBob = 0;
    let heldBob = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
    });
    intersectionObserver.observe(canvas);

    /** Fills `cells` with x, y, w, h for the first `count` cells. */
    const computeCells = (count: number, stacked: boolean) => {
      if (count === 3 && stacked) {
        const top = Math.round(height * 0.58);
        cells[0] = 0;
        cells[1] = 0;
        cells[2] = width;
        cells[3] = top;
        cells[4] = 0;
        cells[5] = top;
        cells[6] = width / 2;
        cells[7] = height - top;
        cells[8] = width / 2;
        cells[9] = top;
        cells[10] = width / 2;
        cells[11] = height - top;
        return;
      }
      // With several columns the first one (the reference) gets extra room.
      const lead = count > 1 ? LEAD_COLUMN_WEIGHT : 1;
      const unit = width / (lead + count - 1);
      let x = 0;
      for (let i = 0; i < count; i++) {
        const cellWidth = i === 0 ? unit * lead : unit;
        cells[i * CELL_STRIDE] = x;
        cells[i * CELL_STRIDE + 1] = 0;
        cells[i * CELL_STRIDE + 2] = cellWidth;
        cells[i * CELL_STRIDE + 3] = height;
        x += cellWidth;
      }
    };

    const placeInCell = (cell: number, settings: Settings, target: Placement) => {
      const x = cells[cell * CELL_STRIDE];
      const y = cells[cell * CELL_STRIDE + 1];
      const w = cells[cell * CELL_STRIDE + 2];
      const h = cells[cell * CELL_STRIDE + 3];
      const reach = runtime.params.l1 + runtime.params.l2;
      const fit = Math.min(w, h - (settings.showLabels ? 36 : 0));
      target.pivotX = x + w / 2;
      target.pivotY = y + h * settings.pivotY + (settings.showLabels ? 10 : 0);
      target.scale = ((fit / 2) * 0.84 * settings.zoom) / reach;
      const size = fit / 420;
      target.size = size < 0.62 ? 0.62 : size > 1.15 ? 1.15 : size;
    };

    const drawLabel = (x: number, y: number, slot: number, text: string, dim: boolean) => {
      ctx.fillStyle = SLOTS[slot].color;
      ctx.globalAlpha = dim ? 0.45 : 1;
      ctx.beginPath();
      ctx.arc(x + 4, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = dim ? 0.5 : 0.92;
      ctx.fillStyle = "#e2e8f0";
      ctx.font = labelFont;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + 16, y + 0.5);
      ctx.globalAlpha = 1;
    };

    const draw = () => {
      const settings = settingsRef.current;
      if (!settings || !visible || width === 0 || height === 0) return;
      const seconds = performance.now() / 1000;
      const params = runtime.params;
      const shown = settings.slots;
      const overlay = settings.layout === "overlay" || shown.length === 1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cellCount = overlay ? 1 : shown.length;
      computeCells(cellCount, width < STACK_BREAKPOINT);

      if (!overlay) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let cell = 1; cell < cellCount; cell++) {
          const x = cells[cell * CELL_STRIDE];
          const y = cells[cell * CELL_STRIDE + 1];
          const h = cells[cell * CELL_STRIDE + 3];
          if (x > 0) {
            ctx.moveTo(Math.round(x) + 0.5, y + 14);
            ctx.lineTo(Math.round(x) + 0.5, y + h - 14);
          }
          if (y > 0 && x === 0) {
            ctx.moveTo(14, Math.round(y) + 0.5);
            ctx.lineTo(width - 14, Math.round(y) + 0.5);
          }
        }
        ctx.stroke();
      }

      let physicsDrawn = false;
      for (let order = 0; order < shown.length; order++) {
        const slot = slotIndex(shown[order]);
        const cell = overlay ? 0 : order;
        placeInCell(cell, settings, place);
        const active = runtime.active[slot];
        const state = runtime.states[slot];
        const color = SLOTS[slot].color;

        if (settings.showGuides && (!overlay || order === 0)) {
          drawGuides(ctx, place, params);
        }

        if (active) {
          drawTrail(ctx, runtime.trails[slot], place, color, settings.trailWidth * place.size);
          drawBody(ctx, settings.view, state[0], state[1], place, params, color, glows[slot]);
        } else if (!overlay) {
          drawGhost(ctx, runtime.initial[0], runtime.initial[1], place, params, color, seconds);
          const cellX = cells[cell * CELL_STRIDE];
          const cellY = cells[cell * CELL_STRIDE + 1];
          const cellW = cells[cell * CELL_STRIDE + 2];
          const cellH = cells[cell * CELL_STRIDE + 3];
          const baseline = cellY + cellH - (cellH < 240 ? 30 : 44);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = titleFont;
          ctx.fillStyle = "rgba(226, 232, 240, 0.86)";
          ctx.fillText(UNTRAINED_TITLE, cellX + cellW / 2, baseline);
          ctx.font = hintFont;
          ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
          ctx.fillText(UNTRAINED_HINT, cellX + cellW / 2, baseline + 18);
        }

        if (slot === PHYSICS_SLOT) {
          physicsDrawn = true;
          physicsPlace.pivotX = place.pivotX;
          physicsPlace.pivotY = place.pivotY;
          physicsPlace.scale = place.scale;
          physicsPlace.size = place.size;
          const bob = heldBob || hoverBob;
          if (settings.interactive && bob !== 0) {
            const k = runtime.kinematics;
            const bx = place.pivotX + (bob === 1 ? k.x1 : k.x2) * place.scale;
            const by = place.pivotY - (bob === 1 ? k.y1 : k.y2) * place.scale;
            drawGrabRing(ctx, bx, by, 22 * place.size, color, heldBob !== 0);
          }
          if (settings.interactive && settings.showLabels && !overlay) {
            const cellY = cells[cell * CELL_STRIDE + 1];
            const cellH = cells[cell * CELL_STRIDE + 3];
            ctx.font = hintFont;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
            ctx.fillText(DRAG_HINT, place.pivotX, cellY + cellH - 20);
          }
        }

        if (settings.showLabels) {
          if (overlay) {
            const text = active ? SLOTS[slot].label : UNTRAINED_LEGEND[slot];
            drawLabel(18, 24 + order * 22, slot, text, !active);
          } else {
            drawLabel(
              cells[cell * CELL_STRIDE] + 18,
              cells[cell * CELL_STRIDE + 1] + 24,
              slot,
              SLOTS[slot].label,
              false,
            );
          }
        }
      }
      if (!physicsDrawn) physicsPlace.scale = 0;
    };

    const unsubscribe = runtime.onFrame(draw);

    /** Returns 1 or 2 for the bob under the pointer, 0 for none. */
    const hitTest = (clientX: number, clientY: number): number => {
      if (physicsPlace.scale === 0) return 0;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const k = runtime.kinematics;
      const dx2 = x - (physicsPlace.pivotX + k.x2 * physicsPlace.scale);
      const dy2 = y - (physicsPlace.pivotY - k.y2 * physicsPlace.scale);
      if (dx2 * dx2 + dy2 * dy2 <= GRAB_RADIUS * GRAB_RADIUS) return 2;
      const dx1 = x - (physicsPlace.pivotX + k.x1 * physicsPlace.scale);
      const dy1 = y - (physicsPlace.pivotY - k.y1 * physicsPlace.scale);
      if (dx1 * dx1 + dy1 * dy1 <= GRAB_RADIUS * GRAB_RADIUS) return 1;
      return 0;
    };

    const dragTo = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      // Pointer in world coordinates relative to the pivot, y up.
      const wx = (clientX - rect.left - physicsPlace.pivotX) / physicsPlace.scale;
      const wy = -(clientY - rect.top - physicsPlace.pivotY) / physicsPlace.scale;
      let theta1 = runtime.states[PHYSICS_SLOT][0];
      let theta2 = runtime.states[PHYSICS_SLOT][1];
      if (heldBob === 1) {
        theta1 = Math.atan2(wx, -wy);
      } else {
        const k = runtime.kinematics;
        theta2 = Math.atan2(wx - k.x1, -(wy - k.y1));
      }
      // Keep both angles in (-pi, pi] so they match the slider range.
      theta1 = Math.atan2(Math.sin(theta1), Math.cos(theta1));
      theta2 = Math.atan2(Math.sin(theta2), Math.cos(theta2));
      runtime.setInitialAngles(theta1, theta2);
      settingsRef.current?.onAnglesChange?.(theta1, theta2);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!settingsRef.current?.interactive) return;
      const bob = hitTest(event.clientX, event.clientY);
      if (bob === 0) return;
      heldBob = bob;
      runtime.setDragging(true);
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
      dragTo(event.clientX, event.clientY);
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!settingsRef.current?.interactive) return;
      if (heldBob !== 0) {
        dragTo(event.clientX, event.clientY);
        return;
      }
      hoverBob = hitTest(event.clientX, event.clientY);
      canvas.style.cursor = hoverBob === 0 ? "" : "grab";
    };
    const onPointerUp = (event: PointerEvent) => {
      if (heldBob === 0) return;
      heldBob = 0;
      runtime.setDragging(false);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      canvas.style.cursor = "";
    };
    const onPointerLeave = () => {
      if (heldBob === 0) hoverBob = 0;
    };
    // Touch scrolling stays enabled everywhere except on the bobs themselves.
    const onTouchStart = (event: TouchEvent) => {
      if (!settingsRef.current?.interactive || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (hitTest(touch.clientX, touch.clientY) !== 0) event.preventDefault();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });

    return () => {
      unsubscribe();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("touchstart", onTouchStart);
      if (heldBob !== 0) runtime.setDragging(false);
    };
  }, [runtime]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      data-testid="pendulum-scene"
      className={cn("block h-full w-full select-none", className)}
    />
  );
}

function slotIndex(id: SlotId): number {
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (SLOTS[i].id === id) return i;
  }
  return PHYSICS_SLOT;
}
