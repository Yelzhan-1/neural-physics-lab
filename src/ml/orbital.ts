import * as tf from "@tensorflow/tfjs";
import {
  DEFAULT_ORBITAL,
  orbitalEnergy,
  orbitalRk4,
  type OrbitalParams,
} from "../engine/orbital";
import { DEFAULT_LAMBDA, MODEL_DT, SEED } from "./constants";
import { DYNAMICS_PROBE, dynamicsBudget, rolloutDynamics, trainDynamics, type DynamicsDataset } from "./dynamics";
import { mulberry32 } from "./rng";
import { winnerOf, type ResultRow } from "./results";
import { createModel, type TrainProgress } from "./train";

const HIDDEN = [32, 32] as const;
const INPUTS = 4;
const INPUT_SCALE = [2, 2, 2, 2];
const OUTPUT_SCALE = [0.06, 0.06, 0.08, 0.08];
const SUBSTEPS = 4;
export const ORBITAL_HEADLESS_STEPS = 320;
export const ORBITAL_PRETRAIN_STEPS = 400;

export interface OrbitalTrainResult {
  trainPairs: number;
  basePairs: number;
  fraction: number;
  lambda: number;
  dt: number;
  steps: number;
  nnLoss: number;
  pinnLoss: number;
  params: OrbitalParams;
}

function advance(state: Float64Array, params: OrbitalParams): void {
  const sub = MODEL_DT / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) orbitalRk4(state, params, sub, state);
}

function sampleOrbit(params: OrbitalParams, rng: () => number): Float64Array {
  const radius = 0.7 + rng() * 0.9;
  const speed = Math.sqrt(params.gm / radius) * (0.55 + rng() * 0.8);
  const angle = rng() * Math.PI * 2;
  return new Float64Array([
    radius * Math.cos(angle),
    radius * Math.sin(angle),
    -speed * Math.sin(angle),
    speed * Math.cos(angle),
  ]);
}

export function buildOrbitalDataset(options: {
  params?: OrbitalParams;
  fraction?: number;
  seed?: number;
  trajectories?: number;
  seconds?: number;
  collocation?: number;
}): DynamicsDataset {
  const params = options.params ?? { ...DEFAULT_ORBITAL };
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
    const state = sampleOrbit(params, rng);
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
    const sample = sampleOrbit(params, rng);
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

/** Acceleration residual a + GM r/|r|³, plus energy and angular-momentum change. */
export function orbitalPenalty(
  state: tf.Tensor2D,
  next: tf.Tensor2D,
  params: OrbitalParams,
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
  const xMid = x.add(x2).mul(0.5);
  const yMid = y.add(y2).mul(0.5);
  const radius = xMid.square().add(yMid.square()).sqrt().maximum(0.2);
  const cube = radius.pow(3);
  const ax = vx2.sub(vx).div(dt).add(xMid.mul(params.gm).div(cube));
  const ay = vy2.sub(vy).div(dt).add(yMid.mul(params.gm).div(cube));
  const force = ax.square().add(ay.square()).mean();
  const vmx = vx.add(vx2).mul(0.5);
  const vmy = vy.add(vy2).mul(0.5);
  const kin = x2.sub(x).div(dt).sub(vmx).square().add(y2.sub(y).div(dt).sub(vmy).square()).mean();
  const r1 = x.square().add(y.square()).sqrt().maximum(0.2);
  const r2 = x2.square().add(y2.square()).sqrt().maximum(0.2);
  const e1 = vx.square().add(vy.square()).mul(0.5).sub(r1.reciprocal().mul(params.gm));
  const e2 = vx2.square().add(vy2.square()).mul(0.5).sub(r2.reciprocal().mul(params.gm));
  const l1 = x.mul(vy).sub(y.mul(vx));
  const l2 = x2.mul(vy2).sub(y2.mul(vx2));
  const conserved = e2.sub(e1).square().mean().add(l2.sub(l1).square().mean());
  return force.add(kin).add(conserved) as tf.Scalar;
}

export function rolloutOrbital(
  model: tf.LayersModel,
  params: OrbitalParams,
  initial: ArrayLike<number>,
  steps: number,
): Float32Array {
  void params;
  return rolloutDynamics(model, initial, steps, INPUT_SCALE, OUTPUT_SCALE);
}

async function fitPair(
  nn: tf.LayersModel,
  pinn: tf.LayersModel,
  dataset: DynamicsDataset,
  params: OrbitalParams,
  lambda: number,
  seed: number,
  steps: number,
  onProgress?: (progress: TrainProgress) => void,
  shouldStop?: () => boolean,
): Promise<{ nnLoss: number; pinnLoss: number }> {
  const penalty = (state: tf.Tensor2D, next: tf.Tensor2D, dt: number) => orbitalPenalty(state, next, params, dt);
  const nnResult = await trainDynamics(nn, dataset, penalty, {
    physics: false,
    lambda,
    steps,
    seed,
    onProgress,
    shouldStop,
  });
  const pinnResult = await trainDynamics(pinn, dataset, penalty, {
    physics: true,
    lambda,
    steps,
    seed,
    onProgress,
    shouldStop,
  });
  return { nnLoss: nnResult.dataLoss, pinnLoss: pinnResult.dataLoss };
}

export class OrbitalSession {
  private nn: tf.LayersModel | null = null;
  private pinn: tf.LayersModel | null = null;
  private source: "pretrained" | "trained" | null = null;

  async train(
    request: {
      fraction: number;
      lambda?: number;
      params: OrbitalParams;
      seed?: number;
      steps?: number;
      calibrate?: boolean;
      targetMs?: number;
    },
    onProgress?: (progress: TrainProgress) => void,
    shouldStop?: () => boolean,
  ): Promise<OrbitalTrainResult> {
    this.clear();
    const fraction = request.fraction;
    const lambda = request.lambda ?? DEFAULT_LAMBDA;
    const seed = request.seed ?? SEED;
    const params = { ...request.params };
    const dataset = buildOrbitalDataset({ params, fraction, seed });
    const nn = createModel(seed, HIDDEN, { inputs: INPUTS, outputs: 4 });
    const pinn = createModel(seed, HIDDEN, { inputs: INPUTS, outputs: 4 });
    this.nn = nn;
    this.pinn = pinn;
    const penalty = (state: tf.Tensor2D, next: tf.Tensor2D, dt: number) => orbitalPenalty(state, next, params, dt);
    try {
      let nnLoss = Number.NaN;
      let pinnLoss = Number.NaN;
      let steps = request.steps ?? 200;
      if (request.calibrate) {
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
        steps = dynamicsBudget(nnMs + pinnMs, request.targetMs);
        const remain = steps - probe;
        if (remain > 0) {
          const nnResult = await trainDynamics(nn, dataset, penalty, {
            physics: false,
            lambda,
            steps: remain,
            startStep: probe,
            totalSteps: steps,
            seed: seed + 51,
            shouldStop,
            onProgress: (progress) =>
              onProgress?.({
                ...progress,
                phase: "training",
                etaSeconds: Math.max(0, ((steps - progress.step) * nnMs + remain * pinnMs) / 1000),
              }),
          });
          const pinnResult = await trainDynamics(pinn, dataset, penalty, {
            physics: true,
            lambda,
            steps: remain,
            startStep: probe,
            totalSteps: steps,
            seed: seed + 51,
            shouldStop,
            onProgress: (progress) =>
              onProgress?.({
                ...progress,
                phase: "training",
                etaSeconds: Math.max(0, ((steps - progress.step) * pinnMs) / 1000),
              }),
          });
          nnLoss = nnResult.dataLoss;
          pinnLoss = pinnResult.dataLoss;
        }
      } else {
        const pair = await fitPair(nn, pinn, dataset, params, lambda, seed + 50, steps, onProgress, shouldStop);
        nnLoss = pair.nnLoss;
        pinnLoss = pair.pinnLoss;
      }
      this.source = "trained";
      return {
        trainPairs: dataset.count,
        basePairs: dataset.basePairs,
        fraction,
        lambda,
        dt: MODEL_DT,
        steps,
        nnLoss,
        pinnLoss,
        params,
      };
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  async loadPretrained(origin: string): Promise<void> {
    if (this.source === "pretrained" && this.nn && this.pinn) return;
    const nn = await tf.loadLayersModel(new URL("/models/orbital/nn/model.json", origin).href);
    let pinn: tf.LayersModel;
    try {
      pinn = await tf.loadLayersModel(new URL("/models/orbital/pinn/model.json", origin).href);
    } catch (error) {
      nn.dispose();
      throw error;
    }
    this.clear();
    this.nn = nn;
    this.pinn = pinn;
    this.source = "pretrained";
  }

  rollout(initial: ArrayLike<number>, seconds: number, params: OrbitalParams): {
    nn: Float32Array;
    pinn: Float32Array;
    dt: number;
  } {
    if (!this.nn || !this.pinn) throw new Error("Train the orbital models first");
    const steps = Math.max(1, Math.round(seconds / MODEL_DT));
    return {
      nn: rolloutOrbital(this.nn, params, initial, steps),
      pinn: rolloutOrbital(this.pinn, params, initial, steps),
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

export async function fitOrbital(
  steps = ORBITAL_PRETRAIN_STEPS,
  params: OrbitalParams = { ...DEFAULT_ORBITAL },
  fraction = 1,
) {
  const dataset = buildOrbitalDataset({ params, fraction, seed: SEED });
  const nn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 4 });
  const pinn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 4 });
  const pair = await fitPair(nn, pinn, dataset, params, DEFAULT_LAMBDA, SEED + 50, steps);
  void pair;
  return { nn, pinn, params };
}

function truthOf(initial: ArrayLike<number>, params: OrbitalParams, steps: number): Float32Array {
  const out = new Float32Array((steps + 1) * 4);
  const state = new Float64Array([initial[0], initial[1], initial[2], initial[3]]);
  out.set(state, 0);
  for (let i = 1; i <= steps; i++) {
    advance(state, params);
    out.set(state, i * 4);
  }
  return out;
}

function score(predicted: Float32Array, truth: Float32Array, params: OrbitalParams) {
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
  const e0 = orbitalEnergy(predicted.subarray(0, 4), params).total;
  const eT = orbitalEnergy(predicted.subarray((samples - 1) * 4, samples * 4), params).total;
  return {
    mse: squared / count,
    mae: absolute / count,
    energyDrift: Math.abs(eT - e0) / Math.max(Math.abs(e0), 1e-9),
  };
}

/** One 5% fit, scored at 2 s and 10 s. */
export async function runOrbitalExperiment(steps = ORBITAL_HEADLESS_STEPS): Promise<ResultRow[]> {
  const params: OrbitalParams = { ...DEFAULT_ORBITAL };
  const dataset = buildOrbitalDataset({ params, fraction: 0.05, seed: SEED, trajectories: 8, seconds: 3 });
  const nn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 4 });
  const pinn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 4 });
  try {
    await fitPair(nn, pinn, dataset, params, DEFAULT_LAMBDA, SEED + 50, steps);
    const rng = mulberry32(SEED + 99);
    const initials = Array.from({ length: 4 }, () => Array.from(sampleOrbit(params, rng)));
    return [2, 10].map((horizon) => {
      const horizonSteps = Math.round(horizon / MODEL_DT);
      const rows = initials.map((initial) => {
        const clock = performance.now();
        const predictedNn = rolloutOrbital(nn, params, initial, horizonSteps);
        const nnMs = (performance.now() - clock) / horizonSteps;
        const clockP = performance.now();
        const predictedPinn = rolloutOrbital(pinn, params, initial, horizonSteps);
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
        id: `EO-${horizon}`,
        experiment: "EO" as const,
        name: "Orbital motion",
        setting: "central gravity, 5% of the data, hidden [32, 32], state MSE in m and m/s",
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
