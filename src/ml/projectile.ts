import * as tf from "@tensorflow/tfjs";
import {
  DEFAULT_PROJECTILE,
  projectileLaunch,
  projectileRk4,
  type ProjectileParams,
} from "../engine/projectile";
import { DEFAULT_LAMBDA, MODEL_DT, SEED } from "./constants";
import { DYNAMICS_PROBE, dynamicsBudget, rolloutDynamics, trainDynamics, type DynamicsDataset } from "./dynamics";
import { mulberry32 } from "./rng";
import { winnerOf, type ResultRow } from "./results";
import { createModel, type TrainProgress } from "./train";

const HIDDEN = [32, 32] as const;
const INPUTS = 4;
const INPUT_SCALE = [8, 6, 14, 14];
const OUTPUT_SCALE = [0.3, 0.3, 0.25, 0.25];
const SUBSTEPS = 4;
export const PROJECTILE_HEADLESS_STEPS = 320;
export const PROJECTILE_PRETRAIN_STEPS = 400;

export interface ProjectileTrainResult {
  trainPairs: number;
  basePairs: number;
  fraction: number;
  lambda: number;
  dt: number;
  steps: number;
  nnLoss: number;
  pinnLoss: number;
  params: ProjectileParams;
}

function advance(state: Float64Array, params: ProjectileParams): void {
  const sub = MODEL_DT / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) projectileRk4(state, params, sub, state);
}

export function buildProjectileDataset(options: {
  params?: ProjectileParams;
  fraction?: number;
  seed?: number;
  trajectories?: number;
  seconds?: number;
  collocation?: number;
}): DynamicsDataset {
  const params = options.params ?? { ...DEFAULT_PROJECTILE };
  const fraction = options.fraction ?? 1;
  const seed = options.seed ?? SEED;
  const trajectories = options.trajectories ?? 8;
  const seconds = options.seconds ?? 3;
  const collocation = options.collocation ?? 256;
  const rng = mulberry32(seed);
  const steps = Math.max(1, Math.round(seconds / MODEL_DT));
  const keep = Math.max(1, Math.min(steps, Math.round(steps * fraction)));
  const count = trajectories * keep;
  const features = new Float32Array(count * INPUTS);
  const targets = new Float32Array(count * 4);
  const states = new Float32Array(count * 4);
  let cursor = 0;
  for (let n = 0; n < trajectories; n++) {
    const angle = 25 + rng() * 50;
    const speed = 6 + rng() * 12;
    const state = new Float64Array(projectileLaunch({ ...params, angle, speed }));
    for (let step = 0; step < steps; step++) {
      if (step < keep) {
        for (let d = 0; d < 4; d++) {
          features[cursor * 4 + d] = state[d] / INPUT_SCALE[d];
          states[cursor * 4 + d] = state[d];
        }
        const before = Float64Array.from(state);
        advance(state, params);
        for (let d = 0; d < 4; d++) targets[cursor * 4 + d] = (state[d] - before[d]) / OUTPUT_SCALE[d];
        cursor++;
      } else {
        advance(state, params);
      }
    }
  }
  const colloFeatures = new Float32Array(collocation * INPUTS);
  const colloStates = new Float32Array(collocation * 4);
  for (let i = 0; i < collocation; i++) {
    const sample = [
      rng() * 10,
      rng() * 6,
      (rng() * 2 - 1) * 14,
      (rng() * 2 - 1) * 14,
    ];
    for (let d = 0; d < 4; d++) {
      colloStates[i * 4 + d] = sample[d];
      colloFeatures[i * 4 + d] = sample[d] / INPUT_SCALE[d];
    }
  }
  return {
    count,
    basePairs: trajectories * steps,
    dt: MODEL_DT,
    inputs: INPUTS,
    features,
    targets,
    states,
    colloFeatures,
    colloStates,
    colloCount: collocation,
    scale: OUTPUT_SCALE,
  };
}

/** Mean square of m a + c |v| v + m g ŷ, plus the kinematic mismatch. */
export function projectilePenalty(
  state: tf.Tensor2D,
  next: tf.Tensor2D,
  params: ProjectileParams,
  dt: number,
): tf.Scalar {
  const x = state.slice([0, 0], [-1, 1]);
  const y = state.slice([0, 1], [-1, 1]);
  const vx = state.slice([0, 2], [-1, 1]);
  const vy = state.slice([0, 3], [-1, 1]);
  const x2 = next.slice([0, 0], [-1, 1]);
  const y2 = next.slice([0, 1], [-1, 1]);
  const vx2 = next.slice([0, 2], [-1, 1]);
  const vy2 = next.slice([0, 3], [-1, 1]);
  const vmx = vx.add(vx2).mul(0.5);
  const vmy = vy.add(vy2).mul(0.5);
  const speed = vmx.square().add(vmy.square()).sqrt();
  const drag = speed.mul(params.c);
  const fx = vx2.sub(vx).div(dt).mul(params.m).add(drag.mul(vmx));
  const fy = vy2.sub(vy).div(dt).mul(params.m).add(drag.mul(vmy)).add(params.m * params.g);
  const kin = x2
    .sub(x)
    .div(dt)
    .sub(vmx)
    .square()
    .add(y2.sub(y).div(dt).sub(vmy).square())
    .mean();
  return fx.square().add(fy.square()).mean().add(kin) as tf.Scalar;
}

export function rolloutProjectile(
  model: tf.LayersModel,
  params: ProjectileParams,
  initial: ArrayLike<number>,
  steps: number,
): Float32Array {
  void params;
  return rolloutDynamics(model, initial, steps, INPUT_SCALE, OUTPUT_SCALE);
}

export class ProjectileSession {
  private nn: tf.LayersModel | null = null;
  private pinn: tf.LayersModel | null = null;
  private source: "pretrained" | "trained" | null = null;

  async train(
    request: {
      fraction: number;
      lambda?: number;
      params: ProjectileParams;
      seed?: number;
      steps?: number;
      calibrate?: boolean;
      targetMs?: number;
    },
    onProgress?: (progress: TrainProgress) => void,
    shouldStop?: () => boolean,
  ): Promise<ProjectileTrainResult> {
    this.clear();
    const fraction = request.fraction;
    const lambda = request.lambda ?? DEFAULT_LAMBDA;
    const seed = request.seed ?? SEED;
    const params = { ...request.params };
    const dataset = buildProjectileDataset({ params, fraction, seed });
    const nn = createModel(seed, HIDDEN, { inputs: INPUTS, outputs: 4 });
    const pinn = createModel(seed, HIDDEN, { inputs: INPUTS, outputs: 4 });
    this.nn = nn;
    this.pinn = pinn;
    const penalty = (state: tf.Tensor2D, next: tf.Tensor2D, dt: number) =>
      projectilePenalty(state, next, params, dt);
    try {
      const trained = request.calibrate
        ? await this.calibrated(nn, pinn, dataset, penalty, lambda, seed, request.targetMs, onProgress, shouldStop)
        : await this.fixed(nn, pinn, dataset, penalty, lambda, seed, request.steps ?? 200, onProgress, shouldStop);
      this.source = "trained";
      return {
        trainPairs: dataset.count,
        basePairs: dataset.basePairs,
        fraction,
        lambda,
        dt: MODEL_DT,
        steps: trained.steps,
        nnLoss: trained.nnLoss,
        pinnLoss: trained.pinnLoss,
        params,
      };
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  private async fixed(
    nn: tf.LayersModel,
    pinn: tf.LayersModel,
    dataset: DynamicsDataset,
    penalty: (state: tf.Tensor2D, next: tf.Tensor2D, dt: number) => tf.Scalar,
    lambda: number,
    seed: number,
    steps: number,
    onProgress?: (progress: TrainProgress) => void,
    shouldStop?: () => boolean,
  ): Promise<{ nnLoss: number; pinnLoss: number; steps: number }> {
    const nnResult = await trainDynamics(nn, dataset, penalty, {
      physics: false,
      lambda,
      steps,
      seed: seed + 50,
      onProgress,
      shouldStop,
    });
    const pinnResult = await trainDynamics(pinn, dataset, penalty, {
      physics: true,
      lambda,
      steps,
      seed: seed + 50,
      onProgress,
      shouldStop,
    });
    return { nnLoss: nnResult.dataLoss, pinnLoss: pinnResult.dataLoss, steps };
  }

  private async calibrated(
    nn: tf.LayersModel,
    pinn: tf.LayersModel,
    dataset: DynamicsDataset,
    penalty: (state: tf.Tensor2D, next: tf.Tensor2D, dt: number) => tf.Scalar,
    lambda: number,
    seed: number,
    targetMs: number | undefined,
    onProgress?: (progress: TrainProgress) => void,
    shouldStop?: () => boolean,
  ): Promise<{ nnLoss: number; pinnLoss: number; steps: number }> {
    const probe = DYNAMICS_PROBE;
    const nnClock = performance.now();
    await trainDynamics(nn, dataset, penalty, {
      physics: false,
      lambda,
      steps: probe,
      seed: seed + 50,
      shouldStop,
      onProgress: (progress) => onProgress?.({ ...progress, phase: "calibrating", etaSeconds: null }),
    });
    const nnMs = (performance.now() - nnClock) / probe;
    const pinnClock = performance.now();
    await trainDynamics(pinn, dataset, penalty, {
      physics: true,
      lambda,
      steps: probe,
      seed: seed + 50,
      shouldStop,
      onProgress: (progress) => onProgress?.({ ...progress, phase: "calibrating", etaSeconds: null }),
    });
    const pinnMs = (performance.now() - pinnClock) / probe;
    const total = dynamicsBudget(nnMs + pinnMs, targetMs);
    const remain = total - probe;
    let nnLoss = Number.NaN;
    let pinnLoss = Number.NaN;
    if (remain > 0) {
      const nnResult = await trainDynamics(nn, dataset, penalty, {
        physics: false,
        lambda,
        steps: remain,
        startStep: probe,
        totalSteps: total,
        seed: seed + 51,
        shouldStop,
        onProgress: (progress) =>
          onProgress?.({
            ...progress,
            phase: "training",
            etaSeconds: Math.max(0, ((total - progress.step) * nnMs + (total - probe) * pinnMs) / 1000),
          }),
      });
      const pinnResult = await trainDynamics(pinn, dataset, penalty, {
        physics: true,
        lambda,
        steps: remain,
        startStep: probe,
        totalSteps: total,
        seed: seed + 51,
        shouldStop,
        onProgress: (progress) =>
          onProgress?.({
            ...progress,
            phase: "training",
            etaSeconds: Math.max(0, ((total - progress.step) * pinnMs) / 1000),
          }),
      });
      nnLoss = nnResult.dataLoss;
      pinnLoss = pinnResult.dataLoss;
    }
    return { nnLoss, pinnLoss, steps: total };
  }

  async loadPretrained(origin: string): Promise<void> {
    if (this.source === "pretrained" && this.nn && this.pinn) return;
    const nn = await tf.loadLayersModel(new URL("/models/projectile/nn/model.json", origin).href);
    let pinn: tf.LayersModel;
    try {
      pinn = await tf.loadLayersModel(new URL("/models/projectile/pinn/model.json", origin).href);
    } catch (error) {
      nn.dispose();
      throw error;
    }
    this.clear();
    this.nn = nn;
    this.pinn = pinn;
    this.source = "pretrained";
  }

  rollout(initial: ArrayLike<number>, seconds: number, params: ProjectileParams): {
    nn: Float32Array;
    pinn: Float32Array;
    dt: number;
  } {
    if (!this.nn || !this.pinn) throw new Error("Train the projectile models first");
    const steps = Math.max(1, Math.round(seconds / MODEL_DT));
    return {
      nn: rolloutProjectile(this.nn, params, initial, steps),
      pinn: rolloutProjectile(this.pinn, params, initial, steps),
      dt: MODEL_DT,
    };
  }

  clear(): void {
    this.nn?.dispose();
    this.pinn?.dispose();
    this.nn = null;
    this.pinn = null;
    this.source = null;
  }
}

export async function fitProjectile(
  steps = PROJECTILE_PRETRAIN_STEPS,
  params: ProjectileParams = { ...DEFAULT_PROJECTILE },
  fraction = 1,
) {
  const dataset = buildProjectileDataset({ params, fraction, seed: SEED });
  const nn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 4 });
  const pinn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 4 });
  const penalty = (state: tf.Tensor2D, next: tf.Tensor2D, dt: number) => projectilePenalty(state, next, params, dt);
  await trainDynamics(nn, dataset, penalty, { physics: false, lambda: DEFAULT_LAMBDA, steps, seed: SEED + 50 });
  await trainDynamics(pinn, dataset, penalty, { physics: true, lambda: DEFAULT_LAMBDA, steps, seed: SEED + 50 });
  return { nn, pinn, params };
}

function truthOf(initial: ArrayLike<number>, params: ProjectileParams, steps: number): Float32Array {
  const out = new Float32Array((steps + 1) * 4);
  const state = new Float64Array([initial[0], initial[1], initial[2], initial[3]]);
  out.set(state, 0);
  for (let i = 1; i <= steps; i++) {
    advance(state, params);
    out.set(state, i * 4);
  }
  return out;
}

function score(predicted: Float32Array, truth: Float32Array, params: ProjectileParams) {
  const samples = predicted.length / 4;
  let squared = 0;
  let absolute = 0;
  let count = 0;
  for (let i = 1; i < samples; i++) {
    for (let d = 0; d < 4; d++) {
      const error = predicted[i * 4 + d] - truth[i * 4 + d];
      squared += error * error;
      absolute += Math.abs(error);
      count++;
    }
  }
  const energy = (sample: number) => {
    const base = sample * 4;
    const speed2 = predicted[base + 2] ** 2 + predicted[base + 3] ** 2;
    return 0.5 * params.m * speed2 + params.m * params.g * predicted[base + 1];
  };
  const e0 = energy(0);
  const eT = energy(samples - 1);
  return {
    mse: squared / count,
    mae: absolute / count,
    energyDrift: Math.abs(eT - e0) / Math.max(Math.abs(e0), 1e-9),
  };
}

/** One 5% fit, scored at 2 s and 10 s. Drag stays on, so energy is not conserved. */
export async function runProjectileExperiment(steps = PROJECTILE_HEADLESS_STEPS): Promise<ResultRow[]> {
  const params: ProjectileParams = { ...DEFAULT_PROJECTILE };
  const dataset = buildProjectileDataset({ params, fraction: 0.05, seed: SEED, trajectories: 8, seconds: 3 });
  const nn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 4 });
  const pinn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 4 });
  const penalty = (state: tf.Tensor2D, next: tf.Tensor2D, dt: number) => projectilePenalty(state, next, params, dt);
  try {
    await trainDynamics(nn, dataset, penalty, { physics: false, lambda: DEFAULT_LAMBDA, steps, seed: SEED + 50 });
    await trainDynamics(pinn, dataset, penalty, { physics: true, lambda: DEFAULT_LAMBDA, steps, seed: SEED + 50 });
    const rng = mulberry32(SEED + 99);
    const initials = Array.from({ length: 4 }, () =>
      Array.from(projectileLaunch({ ...params, angle: 30 + rng() * 40, speed: 8 + rng() * 8 })),
    );
    return [2, 10].map((horizon) => {
      const horizonSteps = Math.round(horizon / MODEL_DT);
      const rows = initials.map((initial) => {
        const clock = performance.now();
        const predictedNn = rolloutProjectile(nn, params, initial, horizonSteps);
        const nnMs = (performance.now() - clock) / horizonSteps;
        const clockP = performance.now();
        const predictedPinn = rolloutProjectile(pinn, params, initial, horizonSteps);
        const pinnMs = (performance.now() - clockP) / horizonSteps;
        const truth = truthOf(initial, params, horizonSteps);
        const nnScore = score(predictedNn, truth, params);
        const pinnScore = score(predictedPinn, truth, params);
        return { nn: { ...nnScore, msPerStep: nnMs }, pinn: { ...pinnScore, msPerStep: pinnMs } };
      });
      const mean = (pick: "nn" | "pinn", key: "mse" | "mae" | "energyDrift" | "msPerStep") =>
        rows.reduce((sum, row) => sum + row[pick][key], 0) / rows.length;
      const nnMetrics = {
        mse: mean("nn", "mse"),
        mae: mean("nn", "mae"),
        energyDrift: mean("nn", "energyDrift"),
        msPerStep: mean("nn", "msPerStep"),
      };
      const pinnMetrics = {
        mse: mean("pinn", "mse"),
        mae: mean("pinn", "mae"),
        energyDrift: mean("pinn", "energyDrift"),
        msPerStep: mean("pinn", "msPerStep"),
      };
      return {
        id: `EP-${horizon}`,
        experiment: "EP" as const,
        name: "Projectile with drag",
        setting: "quadratic drag, 5% of the data, hidden [32, 32], state MSE in m and m/s",
        horizonSeconds: horizon,
        trainPairs: dataset.count,
        basePairs: dataset.basePairs,
        testTrajectories: initials.length,
        nn: nnMetrics,
        pinn: pinnMetrics,
        winner: winnerOf(nnMetrics.mse, pinnMetrics.mse),
      };
    });
  } finally {
    nn.dispose();
    pinn.dispose();
  }
}
