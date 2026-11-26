import * as tf from "@tensorflow/tfjs";
import { MODEL_DT, NORM } from "./constants";

function asTensor(value: tf.Tensor | tf.Tensor[] | tf.SymbolicTensor | tf.SymbolicTensor[]): tf.Tensor {
  if (Array.isArray(value)) throw new Error("expected one output tensor");
  return value as tf.Tensor;
}

/**
 * Autoregressive rollout of the whole horizon in one graph pass.
 * State stays on the device; the only readback is the finished trajectory.
 * The first sample is the release state.
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
  const scale = tf.tensor1d([NORM.dTheta, NORM.dTheta, NORM.dOmega, NORM.dOmega]);
  const rows: tf.Tensor2D[] = [];
  let state = tf.tensor2d([[initial[0], initial[1], initial[2], initial[3]]]);
  rows.push(state);
  try {
    for (let step = 0; step < steps; step++) {
      const next = tf.tidy(() => {
        const theta1 = state.slice([0, 0], [1, 1]);
        const theta2 = state.slice([0, 1], [1, 1]);
        const omega1 = state.slice([0, 2], [1, 1]);
        const omega2 = state.slice([0, 3], [1, 1]);
        const features = tf.concat(
          [
            tf.sin(theta1),
            tf.cos(theta1),
            tf.sin(theta2),
            tf.cos(theta2),
            omega1.div(NORM.omega),
            omega2.div(NORM.omega),
          ],
          1,
        );
        const predicted = asTensor(model.apply(features, { training: false }));
        return state.add(predicted.mul(scale)) as tf.Tensor2D;
      });
      rows.push(next);
      state = next;
    }
    const stacked = tf.concat(rows, 0);
    const raw = stacked.dataSync();
    const out = new Float32Array(raw);
    stacked.dispose();
    return out;
  } finally {
    scale.dispose();
    for (const row of rows) row.dispose();
  }
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
