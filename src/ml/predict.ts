import * as tf from "@tensorflow/tfjs";
import { MODEL_DT, NORM } from "./constants";
import { featuresFromState } from "./features";

function asTensor(value: tf.Tensor | tf.Tensor[] | tf.SymbolicTensor | tf.SymbolicTensor[]): tf.Tensor {
  if (Array.isArray(value)) throw new Error("expected one output tensor");
  return value as tf.Tensor;
}

/**
 * Autoregressive rollout. The first sample is the release state.
 * Each step feeds sin/cos features and adds the predicted state change.
 */
export function rolloutModel(
  model: tf.LayersModel,
  initial: ArrayLike<number>,
  steps: number,
  dt: number = MODEL_DT,
): Float32Array {
  if (Math.abs(dt - MODEL_DT) > 1e-9) {
    throw new Error(`Rollout dt ${dt} does not match the trained step ${MODEL_DT}`);
  }
  const out = new Float32Array((steps + 1) * 4);
  const state = new Float64Array(4);
  for (let i = 0; i < 4; i++) state[i] = initial[i];
  out.set(state, 0);
  const features = new Float32Array(6);
  for (let step = 0; step < steps; step++) {
    featuresFromState(state, features);
    const delta = tf.tidy(() => {
      const input = tf.tensor2d(features, [1, 6]);
      return asTensor(model.apply(input, { training: false })).dataSync();
    });
    state[0] += delta[0] * NORM.dTheta;
    state[1] += delta[1] * NORM.dTheta;
    state[2] += delta[2] * NORM.dOmega;
    state[3] += delta[3] * NORM.dOmega;
    out.set(state, (step + 1) * 4);
  }
  return out;
}

/** Milliseconds per model step, measured after a short warmup. */
export function timeModel(model: tf.LayersModel, dt: number = MODEL_DT): number {
  const initial = [0.8, -0.4, 0, 0];
  rolloutModel(model, initial, 8, dt);
  const steps = 40;
  const t0 = performance.now();
  rolloutModel(model, initial, steps, dt);
  return (performance.now() - t0) / steps;
}
