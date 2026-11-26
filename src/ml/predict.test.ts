import * as tf from "@tensorflow/tfjs";
import { describe, expect, it } from "vitest";
import { NORM } from "./constants";
import { featuresFromState } from "./features";
import { rolloutModel } from "./predict";
import { createModel } from "./train";

describe("rolloutModel", () => {
  it("returns the whole horizon from one pass and matches a single step", () => {
    const model = createModel(4);
    const initial = [0.4, -0.2, 0.1, -0.3];
    const out = rolloutModel(model, initial, 6);
    expect(out.length).toBe(28);
    expect(out[0]).toBeCloseTo(initial[0], 5);
    const features = featuresFromState(initial);
    const delta = tf.tidy(() => {
      const input = tf.tensor2d([Array.from(features)]);
      const predicted = model.apply(input, { training: false }) as tf.Tensor;
      return Array.from(predicted.dataSync());
    });
    expect(out[4]).toBeCloseTo(initial[0] + delta[0] * NORM.dTheta, 4);
    expect(out[5]).toBeCloseTo(initial[1] + delta[1] * NORM.dTheta, 4);
    expect(out[6]).toBeCloseTo(initial[2] + delta[2] * NORM.dOmega, 4);
    expect(out[7]).toBeCloseTo(initial[3] + delta[3] * NORM.dOmega, 4);
    model.dispose();
  });
});
