import { describe, expect, it } from "vitest";
import { DEFAULT_DT, energy, rk4Step, simulate, STATE_SIZE } from "@/engine";
import { HISTORY_STRIDE, LabRuntime, SLOTS } from "./runtime";

const NN = SLOTS.findIndex((slot) => slot.id === "nn");
const PINN = SLOTS.findIndex((slot) => slot.id === "pinn");

describe("LabRuntime", () => {
  it("advances the physics slot in fixed steps, independent of frame timing", () => {
    const smooth = new LabRuntime();
    const jittery = new LabRuntime();
    for (const runtime of [smooth, jittery]) runtime.setInitialAngles(2, -0.4);

    for (let i = 0; i < 120; i++) smooth.tick(1 / 60);
    const uneven = [1 / 30, 1 / 120, 1 / 45, 1 / 90];
    let total = 0;
    for (let i = 0; total < 2 - 1e-9; i++) {
      const elapsed = Math.min(uneven[i % uneven.length], 2 - total);
      jittery.tick(elapsed);
      total += elapsed;
    }

    // Whatever the frame pacing, the state is exactly N fixed RK4 steps.
    for (const runtime of [smooth, jittery]) {
      const steps = Math.round(runtime.time / DEFAULT_DT);
      const expected = Float64Array.from([2, -0.4, 0, 0]);
      for (let i = 0; i < steps; i++) rk4Step(expected, runtime.params, DEFAULT_DT, expected);
      expect(Array.from(runtime.states[0])).toEqual(Array.from(expected));
      expect(Math.abs(runtime.time - 2)).toBeLessThanOrEqual(DEFAULT_DT + 1e-12);
    }
  });

  it("does not move while paused or while a bob is held", () => {
    const runtime = new LabRuntime();
    runtime.setInitialAngles(1, 1);
    runtime.setPlaying(false);
    runtime.tick(0.5);
    expect(runtime.time).toBe(0);
    runtime.setPlaying(true);
    runtime.setDragging(true);
    runtime.tick(0.5);
    expect(runtime.time).toBe(0);
    runtime.setDragging(false);
    runtime.tick(0.5);
    expect(runtime.time).toBeGreaterThan(0);
  });

  it("scales simulated time with speed", () => {
    const runtime = new LabRuntime();
    runtime.setSpeed(2);
    for (let i = 0; i < 60; i++) runtime.tick(1 / 60);
    expect(runtime.time).toBeCloseTo(2, 1);
  });

  it("reports untrained slots as inactive and leaves them at the release pose", () => {
    const runtime = new LabRuntime();
    runtime.setInitialAngles(0.7, -0.2);
    for (let i = 0; i < 30; i++) runtime.tick(1 / 60);
    expect(runtime.active).toEqual([true, false, false]);
    expect(Array.from(runtime.states[NN])).toEqual([0.7, -0.2, 0, 0]);
    expect(runtime.trails[NN].length).toBe(0);
    expect(runtime.trails[0].length).toBeGreaterThan(0);
  });

  it("replays a supplied trajectory against the shared clock", () => {
    const runtime = new LabRuntime();
    runtime.setInitialAngles(1.2, 0.3);
    // A trajectory sampled four times more coarsely than the engine step.
    const stride = 4;
    const fine = simulate([1.2, 0.3, 0, 0], runtime.params, 240 * 3);
    const coarse = new Float32Array((fine.length / STATE_SIZE / stride) * STATE_SIZE);
    for (let i = 0; i < coarse.length / STATE_SIZE; i++) {
      for (let j = 0; j < STATE_SIZE; j++) {
        coarse[i * STATE_SIZE + j] = fine[i * stride * STATE_SIZE + j];
      }
    }
    runtime.setTrajectory("pinn", { states: coarse, dt: DEFAULT_DT * stride });
    expect(runtime.active[PINN]).toBe(true);

    for (let i = 0; i < 60; i++) runtime.tick(1 / 60);
    for (let j = 0; j < STATE_SIZE; j++) {
      expect(runtime.states[PINN][j]).toBeCloseTo(runtime.states[0][j], 2);
    }
    expect(runtime.trails[PINN].length).toBe(runtime.trails[0].length);

    // Past its last sample the trajectory holds its final state.
    for (let i = 0; i < 300; i++) runtime.tick(1 / 60);
    const last = coarse.length - STATE_SIZE;
    for (let j = 0; j < STATE_SIZE; j++) {
      expect(runtime.states[PINN][j]).toBe(coarse[last + j]);
    }

    runtime.setTrajectory("pinn", null);
    expect(runtime.active[PINN]).toBe(false);
  });

  it("tracks energy history and the largest energy error of the run", () => {
    const runtime = new LabRuntime();
    runtime.setInitialAngles(2.1, -0.35);
    const initial = energy(runtime.initial, runtime.params).total;
    expect(runtime.initialEnergy).toBe(initial);
    for (let i = 0; i < 600; i++) runtime.tick(1 / 60);
    expect(runtime.history.length).toBe(
      Math.min(runtime.history.capacity, 1 + Math.floor(runtime.time / DEFAULT_DT / HISTORY_STRIDE)),
    );
    expect(runtime.maxEnergyError / initial).toBeLessThan(1e-4);

    runtime.reset();
    expect(runtime.time).toBe(0);
    expect(runtime.maxEnergyError).toBe(0);
    expect(runtime.history.length).toBe(1);
    expect(runtime.trails[0].length).toBe(0);
  });

  it("notifies frame listeners until they unsubscribe", () => {
    const runtime = new LabRuntime();
    let calls = 0;
    const unsubscribe = runtime.onFrame(() => calls++);
    runtime.tick(1 / 60);
    runtime.tick(1 / 60);
    unsubscribe();
    runtime.tick(1 / 60);
    expect(calls).toBe(2);
  });
});
