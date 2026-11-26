import * as tf from "@tensorflow/tfjs";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../engine";
import { generateDataset } from "./dataset";
import { cosineLearningRate, createModel, trainModel } from "./train";

beforeAll(async () => {
  await tf.setBackend("cpu");
  await tf.ready();
});

describe("training setup", () => {
  it("decays the learning rate from the start value to the end value", () => {
    expect(cosineLearningRate(0, 100, 1e-3, 1e-4)).toBeCloseTo(1e-3, 8);
    expect(cosineLearningRate(99, 100, 1e-3, 1e-4)).toBeCloseTo(1e-4, 8);
    const mid = cosineLearningRate(50, 101, 1e-3, 1e-4);
    expect(mid).toBeGreaterThan(1e-4);
    expect(mid).toBeLessThan(1e-3);
  });

  it("starts both models from the same weights when the seed matches", () => {
    const first = createModel(11);
    const second = createModel(11);
    const other = createModel(12);
    const weights = (model: tf.LayersModel) => Array.from(model.getWeights()[0].dataSync());
    expect(weights(first)).toEqual(weights(second));
    expect(weights(first)).not.toEqual(weights(other));
    expect(weights(first).length).toBe(6 * 64);
    first.dispose();
    second.dispose();
    other.dispose();
  });

  it("keeps a finite data loss, and the PINN physics term is active", async () => {
    const dataset = generateDataset({
      seed: 3,
      params: { ...DEFAULT_PARAMS },
      fraction: 1,
      angleMin: 0.3,
      angleMax: 1.2,
      omegaMax: 0.4,
      trainTrajectories: 2,
      testTrajectories: 1,
      trainSeconds: 0.4,
      testSeconds: 0.2,
      collocation: 32,
    });
    const nn = createModel(3);
    const pinn = createModel(3);
    const shared = { steps: 2, scheduleSeed: 9, lambda: 0.4 };
    const nnResult = await trainModel(nn, dataset, { ...shared, physics: false });
    const pinnResult = await trainModel(pinn, dataset, { ...shared, physics: true });
    expect(Number.isFinite(nnResult.dataLoss)).toBe(true);
    expect(nnResult.physicsLoss).toBe(0);
    expect(Number.isFinite(pinnResult.dataLoss)).toBe(true);
    expect(pinnResult.physicsLoss).toBeGreaterThan(0);
    expect(pinnResult.totalLoss).toBeGreaterThan(pinnResult.dataLoss);
    nn.dispose();
    pinn.dispose();
  });
});
