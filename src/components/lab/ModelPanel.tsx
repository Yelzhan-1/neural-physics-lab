"use client";

import { energy } from "@/engine";
import type { LabRuntime } from "@/components/scene/runtime";
import { driftText, LiveSparks } from "./LiveSparks";

function tip(state: ArrayLike<number>, l1: number, l2: number): { x: number; y: number } {
  return {
    x: l1 * Math.sin(state[0]) + l2 * Math.sin(state[1]),
    y: -l1 * Math.cos(state[0]) - l2 * Math.cos(state[1]),
  };
}

function tipError(runtime: LabRuntime, slot: number): number {
  if (!runtime.active[slot]) return Number.NaN;
  const { l1, l2 } = runtime.params;
  const truth = tip(runtime.states[0], l1, l2);
  const guess = tip(runtime.states[slot], l1, l2);
  return Math.hypot(truth.x - guess.x, truth.y - guess.y);
}

function energyDrift(runtime: LabRuntime, slot: number): number {
  if (!runtime.active[slot]) return Number.NaN;
  const initial = runtime.initialEnergy;
  if (!(initial > 1e-9)) return Number.NaN;
  const total = energy(runtime.states[slot], runtime.params).total;
  return Math.abs(total - initial) / initial;
}

/** Tip-error and energy-drift sparklines for the standard NN and the PINN. */
export function ModelPanel({ runtime, slotsReady = false }: { runtime: LabRuntime; slotsReady?: boolean }) {
  return (
    <LiveSparks
      aLabel="Tip error"
      bLabel="Energy drift"
      formatB={driftText}
      logB
      smooth
      slotsReady={slotsReady}
      sample={() => ({
        t: runtime.time,
        aNn: tipError(runtime, 1),
        aPinn: tipError(runtime, 2),
        bNn: energyDrift(runtime, 1),
        bPinn: energyDrift(runtime, 2),
      })}
    />
  );
}
