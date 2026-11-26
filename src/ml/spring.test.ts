import * as tf from "@tensorflow/tfjs";
import { describe, expect, it } from "vitest";
import { springAnalytic } from "../engine/springMass";
import { buildSpringDataset, springForceMse } from "./spring";

describe("spring residual", () => {
  it("is near zero on a short analytic step", () => {
    const params = { m: 1, k: 4, c: 0, driveAmp: 0, driveOmega: 2 };
    const dt = 0.002;
    const [x1, v1] = springAnalytic(0.8, 0.25, dt, params);
    const loss = springForceMse(
      tf.tensor2d([[0.8, 0.25]]),
      tf.tensor2d([[x1, v1]]),
      params,
      dt,
      tf.tensor2d([[0]]),
    );
    expect(loss.dataSync()[0]).toBeLessThan(1e-4);
    loss.dispose();
  });

  it("keeps a 5% prefix of every trajectory", () => {
    const dataset = buildSpringDataset({ fraction: 0.05, seed: 3, trajectories: 4, seconds: 2 });
    expect(dataset.count).toBeGreaterThan(0);
    expect(dataset.count).toBeLessThan(dataset.basePairs);
    expect(dataset.features.length).toBe(dataset.count * 4);
  });
});
