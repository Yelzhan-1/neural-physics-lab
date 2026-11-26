import * as tf from "@tensorflow/tfjs";
import { describe, expect, it } from "vitest";
import { orbitalAnalytic, orbitalRk4 } from "../engine/orbital";
import { buildOrbitalDataset, orbitalPenalty } from "./orbital";

describe("orbital residual", () => {
  it("is near zero on a short RK4 step", () => {
    const params = { gm: 1, radius: 1, speed: 1 };
    const dt = 0.002;
    const state = new Float64Array(orbitalAnalytic(0, params));
    orbitalRk4(state, params, dt, state);
    const loss = orbitalPenalty(
      tf.tensor2d([[1, 0, 0, 1]]),
      tf.tensor2d([Array.from(state)]),
      params,
      dt,
    );
    expect(loss.dataSync()[0]).toBeLessThan(1e-3);
    loss.dispose();
  });

  it("keeps a 5% prefix of every trajectory", () => {
    const dataset = buildOrbitalDataset({ fraction: 0.05, seed: 3, trajectories: 4, seconds: 2 });
    expect(dataset.count).toBeGreaterThan(0);
    expect(dataset.count).toBeLessThan(dataset.basePairs);
  });
});