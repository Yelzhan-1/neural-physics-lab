import { describe, expect, it } from "vitest";
import { DEFAULT_DT } from "./types";
import {
  angularMomentum,
  circularSpeed,
  DEFAULT_ORBITAL,
  orbitalAcceleration,
  orbitalAnalytic,
  orbitalEnergy,
  orbitalLaunch,
  orbitalRk4,
  simulateOrbital,
} from "./orbital";

describe("orbital motion", () => {
  it("matches the inverse-square acceleration", () => {
    const [ax, ay] = orbitalAcceleration(3, 4, 2);
    const scale = 2 / 125;
    expect(ax).toBeCloseTo(-3 * scale, 10);
    expect(ay).toBeCloseTo(-4 * scale, 10);
  });

  it("conserves energy and angular momentum", () => {
    const params = { ...DEFAULT_ORBITAL, speed: 0.8 };
    const initial = orbitalLaunch(params);
    const energy = orbitalEnergy(initial, params).total;
    const spin = angularMomentum(initial);
    const steps = Math.round(10 / DEFAULT_DT);
    const trajectory = simulateOrbital(initial, params, steps, DEFAULT_DT);
    const end = trajectory.subarray(trajectory.length - 4);
    const final = orbitalEnergy(end, params).total;
    expect(Math.abs(final - energy) / Math.abs(energy)).toBeLessThan(1e-6);
    expect(Math.abs(angularMomentum(end) - spin) / Math.abs(spin)).toBeLessThan(1e-6);
  });

  it("tracks a circular orbit", () => {
    const params = { ...DEFAULT_ORBITAL, speed: circularSpeed(DEFAULT_ORBITAL) };
    const state = new Float64Array(orbitalLaunch(params));
    const horizon = 2;
    const steps = Math.round(horizon / DEFAULT_DT);
    for (let i = 0; i < steps; i++) orbitalRk4(state, params, DEFAULT_DT, state);
    const exact = orbitalAnalytic(horizon, params);
    for (let i = 0; i < 4; i++) expect(state[i]).toBeCloseTo(exact[i], 4);
  });
});
