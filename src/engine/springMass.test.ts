import { describe, expect, it } from "vitest";
import { DEFAULT_DT } from "./types";
import {
  DEFAULT_SPRING,
  simulateSpring,
  springAcceleration,
  springAnalytic,
  springEnergy,
  springRk4,
} from "./springMass";

describe("spring-mass", () => {
  const free = { ...DEFAULT_SPRING, c: 0, driveAmp: 0, k: 4, m: 1 };

  it("matches Newton's law for the restoring force", () => {
    expect(springAcceleration(0.5, 0, 0, free)).toBeCloseTo(-2, 10);
    expect(springAcceleration(0, 1, 0, { ...free, c: 0.5 })).toBeCloseTo(-0.5, 10);
  });

  it("conserves energy when damping and drive are zero", () => {
    const initial = [0.7, -0.4];
    const start = springEnergy(initial, free).total;
    const steps = Math.round(10 / DEFAULT_DT);
    const trajectory = simulateSpring(initial, free, steps, DEFAULT_DT);
    const end = trajectory.subarray(trajectory.length - 2);
    const final = springEnergy(end, free).total;
    expect(Math.abs(final - start) / start).toBeLessThan(1e-6);
  });

  it("tracks the analytic harmonic oscillator", () => {
    const x0 = 0.8;
    const v0 = 0.25;
    const state = new Float64Array([x0, v0]);
    let t = 0;
    const horizon = 2;
    const steps = Math.round(horizon / DEFAULT_DT);
    for (let i = 0; i < steps; i++) t = springRk4(state, free, t, DEFAULT_DT, state);
    const [x, v] = springAnalytic(x0, v0, horizon, free);
    expect(state[0]).toBeCloseTo(x, 5);
    expect(state[1]).toBeCloseTo(v, 5);
  });
});
