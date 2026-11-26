import { describe, expect, it } from "vitest";
import { DEFAULT_DT } from "./types";
import {
  DEFAULT_PROJECTILE,
  projectileAcceleration,
  projectileAnalytic,
  projectileEnergy,
  projectileLanding,
  projectileLaunch,
  projectileRk4,
  simulateProjectile,
} from "./projectile";

describe("projectile", () => {
  const free = { ...DEFAULT_PROJECTILE, c: 0 };

  it("matches the quadratic-drag acceleration", () => {
    const [ax, ay] = projectileAcceleration(3, 4, { ...free, c: 0.2, m: 2, g: 10 });
    expect(ax).toBeCloseTo(-1.5, 8);
    expect(ay).toBeCloseTo(-12, 8);
  });

  it("conserves energy when drag is zero", () => {
    const initial = projectileLaunch(free);
    const start = projectileEnergy(initial, free).total;
    const steps = Math.round(1.2 / DEFAULT_DT);
    const trajectory = simulateProjectile(initial, free, steps, DEFAULT_DT);
    const end = trajectory.subarray(trajectory.length - 4);
    const final = projectileEnergy(end, free).total;
    expect(Math.abs(final - start) / Math.abs(start)).toBeLessThan(1e-6);
  });

  it("tracks the analytic vacuum trajectory", () => {
    const initial = projectileLaunch({ ...free, angle: 40, speed: 12 });
    const state = new Float64Array(initial);
    const horizon = 0.8;
    const steps = Math.round(horizon / DEFAULT_DT);
    for (let i = 0; i < steps; i++) projectileRk4(state, free, DEFAULT_DT, state);
    const exact = projectileAnalytic(initial, horizon, free);
    for (let i = 0; i < 4; i++) expect(state[i]).toBeCloseTo(exact[i], 5);
  });

  it("marks the landing of a vacuum shot", () => {
    const params = { ...free, angle: 45, speed: 10 };
    const steps = Math.round(3 / DEFAULT_DT);
    const trajectory = simulateProjectile(projectileLaunch(params), params, steps, DEFAULT_DT);
    const landing = projectileLanding(trajectory, DEFAULT_DT);
    const range = (10 * 10 * Math.sin(Math.PI / 2)) / params.g;
    expect(landing).not.toBeNull();
    expect(landing!.x).toBeCloseTo(range, 2);
  });
});
