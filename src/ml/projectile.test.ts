import * as tf from "@tensorflow/tfjs";
import { describe, expect, it } from "vitest";
import { projectileAnalytic, projectileLaunch } from "../engine/projectile";
import { buildProjectileDataset, projectilePenalty } from "./projectile";

describe("projectile residual", () => {
  it("is near zero on a short analytic vacuum step", () => {
    const params = { m: 1, g: 9.81, c: 0, angle: 40, speed: 12 };
    const dt = 0.002;
    const initial = projectileLaunch(params);
    const next = projectileAnalytic(initial, dt, params);
    const loss = projectilePenalty(tf.tensor2d([Array.from(initial)]), tf.tensor2d([next]), params, dt);
    expect(loss.dataSync()[0]).toBeLessThan(1e-3);
    loss.dispose();
  });

  it("keeps a 5% prefix of every trajectory", () => {
    const dataset = buildProjectileDataset({ fraction: 0.05, seed: 3, trajectories: 4, seconds: 2 });
    expect(dataset.count).toBeGreaterThan(0);
    expect(dataset.count).toBeLessThan(dataset.basePairs);
    expect(dataset.features.length).toBe(dataset.count * 4);
  });
});
