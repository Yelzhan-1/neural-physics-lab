import * as tf from "@tensorflow/tfjs";
import type { PendulumParams } from "../engine";
import {
  BATCH_SIZE,
  HIDDEN_UNITS,
  LEARNING_RATE,
  LEARNING_RATE_END,
  NORM,
} from "./constants";
import type { Dataset } from "./dataset";
import { featuresFromState, targetFromStates } from "./features";
import { physicsPenalty } from "./physics";
import { mulberry32 } from "./rng";

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

export interface TrainProgress {
  model: "nn" | "pinn";
  step: number;
  steps: number;
  /** Data MSE in normalized state-change units. Comparable across the two models. */
  dataLoss: number;
  physicsLoss: number | null;
  totalLoss: number;
}

export interface TrainOptions {
  physics: boolean;
  lambda: number;
  steps: number;
  batchSize?: number;
  learningRate?: number;
  /** End of the cosine decay. Equal to `learningRate` disables the decay. */
  learningRateEnd?: number;
  /** Same schedule seed for both models, so they see the same minibatches. */
  scheduleSeed: number;
  onProgress?: (progress: TrainProgress) => void;
  shouldStop?: () => boolean;
}

interface LossTensors {
  total: tf.Scalar;
  data: tf.Scalar;
  phys: tf.Scalar;
}

function as2d(value: tf.Tensor | tf.Tensor[] | tf.SymbolicTensor | tf.SymbolicTensor[]): tf.Tensor2D {
  if (Array.isArray(value)) throw new Error("expected one output tensor");
  return value as tf.Tensor2D;
}

/** Layer weights wrap a core `Variable`. The optimizer updates that inner tensor. */
function variablesOf(model: tf.LayersModel): tf.Variable[] {
  return model.trainableWeights.map((weight) => (weight as unknown as { val: tf.Variable }).val);
}

/** Cosine from `start` at step 0 to `end` at the last step. Both models share it. */
export function cosineLearningRate(step: number, steps: number, start: number, end: number): number {
  if (steps <= 1) return end;
  const t = Math.min(Math.max(step, 0), steps - 1) / (steps - 1);
  return end + 0.5 * (start - end) * (1 + Math.cos(Math.PI * t));
}

export function createModel(initSeed: number, hidden: readonly number[] = HIDDEN_UNITS): tf.Sequential {
  const model = tf.sequential();
  hidden.forEach((units, layer) => {
    model.add(
      tf.layers.dense({
        units,
        activation: "tanh",
        kernelInitializer: tf.initializers.glorotUniform({ seed: initSeed + layer }),
        biasInitializer: "zeros",
        ...(layer === 0 ? { inputShape: [6] as [number] } : {}),
      }),
    );
  });
  model.add(
    tf.layers.dense({
      units: 4,
      kernelInitializer: tf.initializers.glorotUniform({ seed: initSeed + hidden.length }),
      biasInitializer: "zeros",
    }),
  );
  return model;
}

function schedules(count: number, steps: number, batchSize: number, seed: number): Int32Array[] {
  const rng = mulberry32(seed);
  const width = Math.min(batchSize, count);
  const batches: Int32Array[] = [];
  for (let step = 0; step < steps; step++) {
    const batch = new Int32Array(width);
    for (let i = 0; i < width; i++) batch[i] = Math.floor(rng() * count);
    batches.push(batch);
  }
  return batches;
}

function pairTensors(dataset: Dataset): {
  features: tf.Tensor2D;
  targets: tf.Tensor2D;
  states: tf.Tensor2D;
  colloStates: tf.Tensor2D;
  colloFeatures: tf.Tensor2D;
} {
  const n = dataset.count;
  const features = new Float32Array(n * 6);
  const targets = new Float32Array(n * 4);
  const feat = new Float32Array(6);
  const target = new Float32Array(4);
  for (let i = 0; i < n; i++) {
    const state = dataset.trainState.subarray(i * 4, i * 4 + 4);
    const next = dataset.trainNext.subarray(i * 4, i * 4 + 4);
    featuresFromState(state, feat);
    targetFromStates(state, next, target);
    features.set(feat, i * 6);
    targets.set(target, i * 4);
  }
  const collo = dataset.collocation.length / 4;
  const colloFeatures = new Float32Array(collo * 6);
  for (let i = 0; i < collo; i++) {
    featuresFromState(dataset.collocation.subarray(i * 4, i * 4 + 4), feat);
    colloFeatures.set(feat, i * 6);
  }
  return {
    features: tf.tensor2d(features, [n, 6]),
    targets: tf.tensor2d(targets, [n, 4]),
    states: tf.tensor2d(dataset.trainState, [n, 4]),
    colloStates: tf.tensor2d(dataset.collocation, [collo, 4]),
    colloFeatures: tf.tensor2d(colloFeatures, [collo, 6]),
  };
}

function lossFor(
  model: tf.LayersModel,
  batch: Int32Array,
  colloBatch: Int32Array | null,
  tensors: ReturnType<typeof pairTensors>,
  params: PendulumParams,
  dt: number,
  lambda: number,
  physics: boolean,
  deltaScale: tf.Tensor1D,
): LossTensors {
  const indices = tf.tensor1d(batch, "int32");
  const x = tf.gather(tensors.features, indices) as tf.Tensor2D;
  const y = tf.gather(tensors.targets, indices) as tf.Tensor2D;
  const state = tf.gather(tensors.states, indices) as tf.Tensor2D;
  const predicted = as2d(model.apply(x, { training: true }));
  const data = predicted.sub(y).square().mean() as tf.Scalar;
  if (!physics || !colloBatch) {
    return { total: data.clone() as tf.Scalar, data, phys: tf.scalar(0) };
  }
  const next = state.add(predicted.mul(deltaScale)) as tf.Tensor2D;
  const onData = physicsPenalty(state, next, params, dt);
  const colloIndex = tf.tensor1d(colloBatch, "int32");
  const colloState = tf.gather(tensors.colloStates, colloIndex) as tf.Tensor2D;
  const colloX = tf.gather(tensors.colloFeatures, colloIndex) as tf.Tensor2D;
  const colloPredicted = as2d(model.apply(colloX, { training: true }));
  const colloNext = colloState.add(colloPredicted.mul(deltaScale)) as tf.Tensor2D;
  const onCollo = physicsPenalty(colloState, colloNext, params, dt);
  const phys = onData.add(onCollo).mul(0.5) as tf.Scalar;
  return { total: data.add(phys.mul(lambda)) as tf.Scalar, data, phys };
}

/**
 * Trains one MLP. `physics: false` is the standard NN (data MSE only).
 * `physics: true` adds λ times the residual on the batch and on unlabeled
 * collocation states. The caller owns the returned model.
 */
export async function trainModel(
  model: tf.Sequential,
  dataset: Dataset,
  options: TrainOptions,
): Promise<{ dataLoss: number; physicsLoss: number; totalLoss: number }> {
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const learningRate = options.learningRate ?? LEARNING_RATE;
  const learningRateEnd = options.learningRateEnd ?? LEARNING_RATE_END;
  const optimizer = tf.train.adam(learningRate);
  const tensors = pairTensors(dataset);
  const deltaScale = tf.tensor1d([NORM.dTheta, NORM.dTheta, NORM.dOmega, NORM.dOmega]);
  const dataBatches = schedules(dataset.count, options.steps, batchSize, options.scheduleSeed);
  const colloCount = dataset.collocation.length / 4;
  const colloBatches = options.physics
    ? schedules(colloCount, options.steps, batchSize, options.scheduleSeed + 1)
    : null;

  let dataLoss = Number.NaN;
  let physicsLoss = Number.NaN;
  let totalLoss = Number.NaN;
  const kept: { data: tf.Tensor | null; phys: tf.Tensor | null } = { data: null, phys: null };
  try {
    const yieldEvery = options.steps > 400 ? 20 : 4;
    for (let step = 0; step < options.steps; step++) {
      if (options.shouldStop?.()) break;
      // Adam reads this number on every step. The node build has no setLearningRate.
      (optimizer as unknown as { learningRate: number }).learningRate = cosineLearningRate(
        step,
        options.steps,
        learningRate,
        learningRateEnd,
      );
      const total = optimizer.minimize(() => {
        const losses = lossFor(
          model,
          dataBatches[step],
          colloBatches ? colloBatches[step] : null,
          tensors,
          dataset.params,
          dataset.dt,
          options.lambda,
          options.physics,
          deltaScale,
        );
        kept.data = tf.keep(losses.data.clone());
        kept.phys = tf.keep(losses.phys.clone());
        return losses.total;
      }, true, variablesOf(model));
      if (!total || !kept.data || !kept.phys) {
        throw new Error("Training step produced an empty gradient");
      }
      totalLoss = total.dataSync()[0];
      dataLoss = kept.data.dataSync()[0];
      physicsLoss = kept.phys.dataSync()[0];
      total.dispose();
      kept.data.dispose();
      kept.phys.dispose();
      kept.data = null;
      kept.phys = null;
      if (!Number.isFinite(totalLoss) || !Number.isFinite(dataLoss)) {
        throw new Error("Training loss became non-finite. Try a smaller learning rate or λ.");
      }
      options.onProgress?.({
        model: options.physics ? "pinn" : "nn",
        step: step + 1,
        steps: options.steps,
        dataLoss,
        physicsLoss: options.physics ? physicsLoss : null,
        totalLoss,
      });
      if ((step + 1) % yieldEvery === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    optimizer.dispose();
    tensors.features.dispose();
    tensors.targets.dispose();
    tensors.states.dispose();
    tensors.colloStates.dispose();
    tensors.colloFeatures.dispose();
    deltaScale.dispose();
    kept.data?.dispose();
    kept.phys?.dispose();
  }
  return { dataLoss, physicsLoss, totalLoss };
}
