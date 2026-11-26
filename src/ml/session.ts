import type { PendulumParams } from "../engine";
import { DEFAULT_LAMBDA, LIVE_STEPS, LIVE_TRAIN_TARGET_MS, MODEL_DT, ROLLOUT_SECONDS, SEED } from "./constants";
import { generateDataset } from "./dataset";
import { rolloutModel } from "./predict";
import { CancelledError, createModel, trainModel, type TrainProgress } from "./train";
import * as tf from "@tensorflow/tfjs";

export interface TrainRequest {
  fraction: number;
  lambda?: number;
  params: PendulumParams;
  seed?: number;
  steps?: number;
  /** Measure a few steps, then pick a budget that lands near `targetMs`. */
  calibrate?: boolean;
  targetMs?: number;
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

const PROBE_STEPS = 4;

/**
 * Holds the two lab models. Both are created with the same seed before either
 * is trained, and both see the same minibatches. Only the loss differs.
 */
export class LabSession {
  private nn: tf.LayersModel | null = null;
  private pinn: tf.LayersModel | null = null;
  private dt = MODEL_DT;
  private source: "pretrained" | "trained" | null = null;
  private system: string | null = null;

  async train(
    request: TrainRequest,
    onProgress?: (progress: TrainProgress) => void,
    shouldStop?: () => boolean,
  ): Promise<TrainSummary> {
    if (request.calibrate) return this.trainCalibrated(request, onProgress, shouldStop);
    this.clear();
    const fraction = request.fraction;
    const lambda = request.lambda ?? DEFAULT_LAMBDA;
    const seed = request.seed ?? SEED;
    const steps = request.steps ?? LIVE_STEPS;
    const params = { ...request.params };
    const dataset = this.datasetFor(seed, params, fraction);
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
      this.source = "trained";
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

  /**
   * Times a short probe on this device, then keeps training until both models
   * together have used about `targetMs`. The probe steps count toward the budget.
   */
  private async trainCalibrated(
    request: TrainRequest,
    onProgress?: (progress: TrainProgress) => void,
    shouldStop?: () => boolean,
  ): Promise<TrainSummary> {
    this.clear();
    const fraction = request.fraction;
    const lambda = request.lambda ?? DEFAULT_LAMBDA;
    const seed = request.seed ?? SEED;
    const targetMs = request.targetMs ?? LIVE_TRAIN_TARGET_MS;
    const params = { ...request.params };
    const dataset = this.datasetFor(seed, params, fraction);
    const nn = createModel(seed);
    const pinn = createModel(seed);
    this.nn = nn;
    this.pinn = pinn;
    this.dt = dataset.dt;
    const probe = PROBE_STEPS;
    try {
      const nnClock = now();
      const nnProbe = await trainModel(nn, dataset, {
        physics: false,
        lambda,
        steps: probe,
        scheduleSeed: seed + 50,
        shouldStop,
        onProgress: (progress) => onProgress?.({ ...progress, phase: "calibrating", etaSeconds: null }),
      });
      const nnMs = (now() - nnClock) / probe;
      if (shouldStop?.()) throw new CancelledError();
      const pinnClock = now();
      const pinnProbe = await trainModel(pinn, dataset, {
        physics: true,
        lambda,
        steps: probe,
        scheduleSeed: seed + 50,
        shouldStop,
        onProgress: (progress) => onProgress?.({ ...progress, phase: "calibrating", etaSeconds: null }),
      });
      const pinnMs = (now() - pinnClock) / probe;
      if (shouldStop?.()) throw new CancelledError();

      const pairMs = Math.max(nnMs + pinnMs, 0.5);
      const totalSteps = Math.max(probe, Math.min(2000, Math.round(targetMs / pairMs)));
      const remain = totalSteps - probe;
      let nnResult = nnProbe;
      let pinnResult = pinnProbe;
      if (remain > 0) {
        nnResult = await trainModel(nn, dataset, {
          physics: false,
          lambda,
          steps: remain,
          startStep: probe,
          totalSteps,
          scheduleSeed: seed + 51,
          shouldStop,
          onProgress: (progress) => {
            const nnLeft = totalSteps - progress.step;
            const pinnLeft = totalSteps - probe;
            onProgress?.({
              ...progress,
              phase: "training",
              etaSeconds: Math.max(0, (nnLeft * nnMs + pinnLeft * pinnMs) / 1000),
            });
          },
        });
        if (shouldStop?.()) throw new CancelledError();
        pinnResult = await trainModel(pinn, dataset, {
          physics: true,
          lambda,
          steps: remain,
          startStep: probe,
          totalSteps,
          scheduleSeed: seed + 51,
          shouldStop,
          onProgress: (progress) => {
            onProgress?.({
              ...progress,
              phase: "training",
              etaSeconds: Math.max(0, ((totalSteps - progress.step) * pinnMs) / 1000),
            });
          },
        });
      }
      this.source = "trained";
      return {
        trainPairs: dataset.count,
        basePairs: dataset.basePairs,
        fraction,
        lambda,
        dt: dataset.dt,
        steps: totalSteps,
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

  async loadPretrained(system = "double-pendulum", origin = "http://localhost"): Promise<void> {
    if (this.source === "pretrained" && this.system === system && this.nn && this.pinn) return;
    const nnUrl = new URL(`/models/${system}/nn/model.json`, origin).href;
    const pinnUrl = new URL(`/models/${system}/pinn/model.json`, origin).href;
    const nn = await tf.loadLayersModel(nnUrl);
    let pinn: tf.LayersModel;
    try {
      pinn = await tf.loadLayersModel(pinnUrl);
    } catch (error) {
      nn.dispose();
      throw error;
    }
    this.clear();
    this.nn = nn;
    this.pinn = pinn;
    this.dt = MODEL_DT;
    this.system = system;
    this.source = "pretrained";
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
    this.source = null;
    this.system = null;
  }

  private datasetFor(seed: number, params: PendulumParams, fraction: number) {
    return generateDataset({
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
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
