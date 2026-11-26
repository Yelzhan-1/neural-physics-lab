import type { PendulumParams } from "../engine";
import { DEFAULT_LAMBDA, LIVE_STEPS, MODEL_DT, ROLLOUT_SECONDS, SEED } from "./constants";
import { generateDataset } from "./dataset";
import { rolloutModel } from "./predict";
import { CancelledError, createModel, trainModel, type TrainProgress } from "./train";
import type * as tf from "@tensorflow/tfjs";

export interface TrainRequest {
  fraction: number;
  lambda?: number;
  params: PendulumParams;
  seed?: number;
  steps?: number;
}

export interface TrainSummary {
  trainPairs: number;
  basePairs: number;
  fraction: number;
  lambda: number;
  dt: number;
  steps: number;
  nnLoss: number;
  pinnLoss: number;
  pinnPhysics: number;
  params: PendulumParams;
}

/**
 * Holds the two lab models. Both are created with the same seed before either
 * is trained, and both see the same minibatches. Only the loss differs.
 */
export class LabSession {
  private nn: tf.LayersModel | null = null;
  private pinn: tf.LayersModel | null = null;
  private dt = MODEL_DT;

  async train(
    request: TrainRequest,
    onProgress?: (progress: TrainProgress) => void,
    shouldStop?: () => boolean,
  ): Promise<TrainSummary> {
    this.clear();
    const fraction = request.fraction;
    const lambda = request.lambda ?? DEFAULT_LAMBDA;
    const seed = request.seed ?? SEED;
    const steps = request.steps ?? LIVE_STEPS;
    const params = { ...request.params };
    const dataset = generateDataset({
      seed,
      params,
      fraction,
      angleMin: 0.2,
      angleMax: 2.2,
      omegaMax: 1.2,
      restFraction: 0.5,
      testTrajectories: 1,
      testSeconds: 0.2,
    });
    const nn = createModel(seed);
    const pinn = createModel(seed);
    this.nn = nn;
    this.pinn = pinn;
    this.dt = dataset.dt;
    try {
      const nnResult = await trainModel(nn, dataset, {
        physics: false,
        lambda,
        steps,
        scheduleSeed: seed + 50,
        onProgress,
        shouldStop,
      });
      if (shouldStop?.()) throw new CancelledError();
      const pinnResult = await trainModel(pinn, dataset, {
        physics: true,
        lambda,
        steps,
        scheduleSeed: seed + 50,
        onProgress,
        shouldStop,
      });
      return {
        trainPairs: dataset.count,
        basePairs: dataset.basePairs,
        fraction,
        lambda,
        dt: dataset.dt,
        steps,
        nnLoss: nnResult.dataLoss,
        pinnLoss: pinnResult.dataLoss,
        pinnPhysics: pinnResult.physicsLoss,
        params,
      };
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  rollout(initial: ArrayLike<number>, seconds = ROLLOUT_SECONDS): {
    nn: Float32Array;
    pinn: Float32Array;
    dt: number;
  } {
    if (!this.nn || !this.pinn) throw new Error("Train the models first");
    const steps = Math.max(1, Math.round(seconds / this.dt));
    return {
      nn: rolloutModel(this.nn, initial, steps, this.dt),
      pinn: rolloutModel(this.pinn, initial, steps, this.dt),
      dt: this.dt,
    };
  }

  clear(): void {
    this.nn?.dispose();
    this.pinn?.dispose();
    this.nn = null;
    this.pinn = null;
  }
}
