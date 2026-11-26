import * as tf from "@tensorflow/tfjs";
import {
  BATCH_SIZE,
  LEARNING_RATE,
  LEARNING_RATE_END,
  LIVE_TRAIN_TARGET_MS,
} from "./constants";
import { mulberry32 } from "./rng";
import { cosineLearningRate, type TrainProgress } from "./train";

export interface DynamicsDataset {
  count: number;
  basePairs: number;
  dt: number;
  inputs: number;
  features: Float32Array;
  targets: Float32Array;
  states: Float32Array;
  colloFeatures: Float32Array;
  colloStates: Float32Array;
  colloCount: number;
  /** Network outputs are state changes divided by these scales. */
  scale: number[];
}

export type DynamicsPenalty = (state: tf.Tensor2D, next: tf.Tensor2D, dt: number) => tf.Scalar;

function variablesOf(model: tf.LayersModel): tf.Variable[] {
  return model.trainableWeights.map((weight) => (weight as unknown as { val: tf.Variable }).val);
}

export async function trainDynamics(
  model: tf.LayersModel,
  dataset: DynamicsDataset,
  penalty: DynamicsPenalty,
  options: {
    physics: boolean;
    lambda: number;
    steps: number;
    seed: number;
    startStep?: number;
    totalSteps?: number;
    onProgress?: (progress: TrainProgress) => void;
    shouldStop?: () => boolean;
  },
): Promise<{ dataLoss: number; physicsLoss: number }> {
  const optimizer = tf.train.adam(LEARNING_RATE);
  const width = dataset.inputs;
  const outputs = dataset.scale.length;
  const features = tf.tensor2d(dataset.features, [dataset.count, width]);
  const targets = tf.tensor2d(dataset.targets, [dataset.count, outputs]);
  const states = tf.tensor2d(dataset.states, [dataset.count, outputs]);
  const colloFeatures = tf.tensor2d(dataset.colloFeatures, [dataset.colloCount, width]);
  const colloStates = tf.tensor2d(dataset.colloStates, [dataset.colloCount, outputs]);
  const scale = tf.tensor1d(dataset.scale);
  const rng = mulberry32(options.seed + (options.startStep ?? 0));
  const batchWidth = Math.min(BATCH_SIZE, dataset.count);
  const start = options.startStep ?? 0;
  const total = options.totalSteps ?? options.steps;
  let dataLoss = Number.NaN;
  let physicsLoss = Number.NaN;
  try {
    for (let step = 0; step < options.steps; step++) {
      if (options.shouldStop?.()) break;
      const globalStep = start + step;
      (optimizer as unknown as { learningRate: number }).learningRate = cosineLearningRate(
        globalStep,
        total,
        LEARNING_RATE,
        LEARNING_RATE_END,
      );
      const batch = Array.from({ length: batchWidth }, () => Math.floor(rng() * dataset.count));
      const colloBatch = Array.from({ length: batchWidth }, () => Math.floor(rng() * dataset.colloCount));
      const kept: { data: tf.Tensor | null; phys: tf.Tensor | null } = { data: null, phys: null };
      const loss = optimizer.minimize(() => {
        const index = tf.tensor1d(batch, "int32");
        const x = tf.gather(features, index) as tf.Tensor2D;
        const y = tf.gather(targets, index) as tf.Tensor2D;
        const predicted = model.apply(x, { training: true }) as tf.Tensor2D;
        const data = predicted.sub(y).square().mean() as tf.Scalar;
        if (!options.physics) {
          kept.data = tf.keep(data.clone());
          kept.phys = tf.keep(tf.scalar(0));
          return data.clone();
        }
        const state = tf.gather(states, index) as tf.Tensor2D;
        const next = state.add(predicted.mul(scale)) as tf.Tensor2D;
        const onData = penalty(state, next, dataset.dt);
        const colloIndex = tf.tensor1d(colloBatch, "int32");
        const colloX = tf.gather(colloFeatures, colloIndex) as tf.Tensor2D;
        const colloPredicted = model.apply(colloX, { training: true }) as tf.Tensor2D;
        const colloState = tf.gather(colloStates, colloIndex) as tf.Tensor2D;
        const colloNext = colloState.add(colloPredicted.mul(scale)) as tf.Tensor2D;
        const onCollo = penalty(colloState, colloNext, dataset.dt);
        const phys = onData.add(onCollo).mul(0.5) as tf.Scalar;
        kept.data = tf.keep(data.clone());
        kept.phys = tf.keep(phys.clone());
        return data.add(phys.mul(options.lambda)) as tf.Scalar;
      }, true, variablesOf(model));
      if (!loss || !kept.data || !kept.phys) throw new Error("Training step produced an empty gradient");
      dataLoss = kept.data.dataSync()[0];
      physicsLoss = kept.phys.dataSync()[0];
      loss.dispose();
      kept.data.dispose();
      kept.phys.dispose();
      options.onProgress?.({
        model: options.physics ? "pinn" : "nn",
        step: globalStep + 1,
        steps: total,
        dataLoss,
        physicsLoss: options.physics ? physicsLoss : null,
        totalLoss: dataLoss,
      });
      if ((step + 1) % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    optimizer.dispose();
    features.dispose();
    targets.dispose();
    states.dispose();
    colloFeatures.dispose();
    colloStates.dispose();
    scale.dispose();
  }
  return { dataLoss, physicsLoss };
}

/** One batched rollout. `scale` is the network's state-change scale. Features are state / inputScale. */
export function rolloutDynamics(
  model: tf.LayersModel,
  initial: ArrayLike<number>,
  steps: number,
  inputScale: number[],
  outputScale: number[],
): Float32Array {
  const scale = tf.tensor1d(outputScale);
  const input = tf.tensor1d(inputScale);
  const rows: tf.Tensor2D[] = [];
  let state = tf.tensor2d([Array.from(initial)]);
  rows.push(state);
  try {
    for (let step = 0; step < steps; step++) {
      const next = tf.tidy(() => {
        const features = state.div(input);
        const predicted = model.apply(features, { training: false }) as tf.Tensor2D;
        return state.add(predicted.mul(scale)) as tf.Tensor2D;
      });
      rows.push(next);
      state = next;
    }
    const stacked = tf.concat(rows, 0);
    const out = new Float32Array(stacked.dataSync());
    stacked.dispose();
    return out;
  } finally {
    scale.dispose();
    input.dispose();
    for (const row of rows) row.dispose();
  }
}

export const DYNAMICS_PROBE = 4;

export function dynamicsBudget(pairMs: number, targetMs = LIVE_TRAIN_TARGET_MS): number {
  return Math.max(DYNAMICS_PROBE, Math.min(2000, Math.round(targetMs / Math.max(pairMs, 0.5))));
}
