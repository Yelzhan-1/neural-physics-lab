import * as tf from "@tensorflow/tfjs";
import {
  DEFAULT_SPRING,
  springEnergy,
  springRk4,
  type SpringParams,
} from "../engine/springMass";
import {
  BATCH_SIZE,
  DEFAULT_LAMBDA,
  LEARNING_RATE,
  LEARNING_RATE_END,
  MODEL_DT,
  SEED,
  SPRING_LIVE_STEPS,
} from "./constants";
import { mulberry32 } from "./rng";
import { winnerOf, type ResultRow } from "./results";
import { cosineLearningRate, createModel, type TrainProgress } from "./train";

const HIDDEN = [32, 32] as const;
const INPUTS = 4;
const DX = 0.12;
const DV = 0.3;
const X_SCALE = 1.2;
const V_SCALE = 2.5;
const SUBSTEPS = 4;
export const SPRING_HEADLESS_STEPS = 320;

export interface SpringDataset {
  count: number;
  basePairs: number;
  dt: number;
  params: SpringParams;
  features: Float32Array;
  targets: Float32Array;
  states: Float32Array;
  times: Float32Array;
  colloFeatures: Float32Array;
  colloStates: Float32Array;
  colloTimes: Float32Array;
  colloCount: number;
}

function featuresOf(x: number, v: number, t: number, params: SpringParams, out: Float32Array, offset = 0): void {
  const phase = params.driveOmega * t;
  out[offset] = x / X_SCALE;
  out[offset + 1] = v / V_SCALE;
  out[offset + 2] = Math.sin(phase);
  out[offset + 3] = Math.cos(phase);
}

function advance(state: Float64Array, params: SpringParams, t: number): number {
  const sub = MODEL_DT / SUBSTEPS;
  let time = t;
  for (let i = 0; i < SUBSTEPS; i++) time = springRk4(state, params, time, sub, state);
  return time;
}

export function buildSpringDataset(options: {
  params?: SpringParams;
  fraction?: number;
  seed?: number;
  trajectories?: number;
  seconds?: number;
  collocation?: number;
}): SpringDataset {
  const params = options.params ?? { ...DEFAULT_SPRING };
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
  const targets = new Float32Array(count * 2);
  const states = new Float32Array(count * 2);
  const times = new Float32Array(count);
  let cursor = 0;
  for (let n = 0; n < trajectories; n++) {
    const state = new Float64Array([(rng() * 2 - 1) * 1, (rng() * 2 - 1) * 1.4]);
    let t = 0;
    for (let step = 0; step < steps; step++) {
      if (step < keep) {
        const at = cursor * INPUTS;
        featuresOf(state[0], state[1], t, params, features, at);
        states[cursor * 2] = state[0];
        states[cursor * 2 + 1] = state[1];
        times[cursor] = t;
        const x0 = state[0];
        const v0 = state[1];
        t = advance(state, params, t);
        targets[cursor * 2] = (state[0] - x0) / DX;
        targets[cursor * 2 + 1] = (state[1] - v0) / DV;
        cursor++;
      } else {
        t = advance(state, params, t);
      }
    }
  }
  const colloFeatures = new Float32Array(collocation * INPUTS);
  const colloStates = new Float32Array(collocation * 2);
  const colloTimes = new Float32Array(collocation);
  for (let i = 0; i < collocation; i++) {
    const x = (rng() * 2 - 1) * 1.2;
    const v = (rng() * 2 - 1) * 2;
    const t = rng() * seconds;
    featuresOf(x, v, t, params, colloFeatures, i * INPUTS);
    colloStates[i * 2] = x;
    colloStates[i * 2 + 1] = v;
    colloTimes[i] = t;
  }
  return {
    count,
    basePairs: trajectories * steps,
    dt: MODEL_DT,
    params,
    features,
    targets,
    states,
    times,
    colloFeatures,
    colloStates,
    colloTimes,
    colloCount: collocation,
  };
}

/** Mean square of m a + c v + k x − F on a proposed step. */
export function springForceMse(
  state: tf.Tensor2D,
  next: tf.Tensor2D,
  params: SpringParams,
  dt: number,
  time: tf.Tensor2D,
): tf.Scalar {
  const x = state.slice([0, 0], [-1, 1]);
  const v = state.slice([0, 1], [-1, 1]);
  const x2 = next.slice([0, 0], [-1, 1]);
  const v2 = next.slice([0, 1], [-1, 1]);
  const accel = v2.sub(v).div(dt);
  const vMid = v.add(v2).mul(0.5);
  const xMid = x.add(x2).mul(0.5);
  const drive = tf.sin(time.add(dt / 2).mul(params.driveOmega)).mul(params.driveAmp);
  const force = accel.mul(params.m).add(vMid.mul(params.c)).add(xMid.mul(params.k)).sub(drive);
  return force.square().mean() as tf.Scalar;
}

function springPenalty(
  state: tf.Tensor2D,
  next: tf.Tensor2D,
  params: SpringParams,
  dt: number,
  time: tf.Tensor2D,
): tf.Scalar {
  const force = springForceMse(state, next, params, dt, time);
  const x = state.slice([0, 0], [-1, 1]);
  const v = state.slice([0, 1], [-1, 1]);
  const x2 = next.slice([0, 0], [-1, 1]);
  const v2 = next.slice([0, 1], [-1, 1]);
  const kin = x2.sub(x).div(dt).sub(v.add(v2).mul(0.5));
  return force.div(16).add(kin.square().mean()) as tf.Scalar;
}

function variablesOf(model: tf.LayersModel): tf.Variable[] {
  return model.trainableWeights.map((weight) => (weight as unknown as { val: tf.Variable }).val);
}

async function trainOne(
  model: tf.LayersModel,
  dataset: SpringDataset,
  options: {
    physics: boolean;
    lambda: number;
    steps: number;
    seed: number;
    onProgress?: (progress: TrainProgress) => void;
    shouldStop?: () => boolean;
  },
): Promise<{ dataLoss: number; physicsLoss: number }> {
  const optimizer = tf.train.adam(LEARNING_RATE);
  const features = tf.tensor2d(dataset.features, [dataset.count, INPUTS]);
  const targets = tf.tensor2d(dataset.targets, [dataset.count, 2]);
  const states = tf.tensor2d(dataset.states, [dataset.count, 2]);
  const times = tf.tensor2d(dataset.times, [dataset.count, 1]);
  const colloFeatures = tf.tensor2d(dataset.colloFeatures, [dataset.colloCount, INPUTS]);
  const colloStates = tf.tensor2d(dataset.colloStates, [dataset.colloCount, 2]);
  const colloTimes = tf.tensor2d(dataset.colloTimes, [dataset.colloCount, 1]);
  const scale = tf.tensor1d([DX, DV]);
  const rng = mulberry32(options.seed);
  const width = Math.min(BATCH_SIZE, dataset.count);
  let dataLoss = Number.NaN;
  let physicsLoss = Number.NaN;
  try {
    for (let step = 0; step < options.steps; step++) {
      if (options.shouldStop?.()) break;
      (optimizer as unknown as { learningRate: number }).learningRate = cosineLearningRate(
        step,
        options.steps,
        LEARNING_RATE,
        LEARNING_RATE_END,
      );
      const batch = Array.from({ length: width }, () => Math.floor(rng() * dataset.count));
      const colloBatch = Array.from({ length: width }, () => Math.floor(rng() * dataset.colloCount));
      const kept: { data: tf.Tensor | null; phys: tf.Tensor | null } = { data: null, phys: null };
      const total = optimizer.minimize(() => {
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
        const time = tf.gather(times, index) as tf.Tensor2D;
        const next = state.add(predicted.mul(scale)) as tf.Tensor2D;
        const onData = springPenalty(state, next, dataset.params, dataset.dt, time);
        const colloIndex = tf.tensor1d(colloBatch, "int32");
        const colloX = tf.gather(colloFeatures, colloIndex) as tf.Tensor2D;
        const colloPredicted = model.apply(colloX, { training: true }) as tf.Tensor2D;
        const colloState = tf.gather(colloStates, colloIndex) as tf.Tensor2D;
        const colloTime = tf.gather(colloTimes, colloIndex) as tf.Tensor2D;
        const colloNext = colloState.add(colloPredicted.mul(scale)) as tf.Tensor2D;
        const onCollo = springPenalty(colloState, colloNext, dataset.params, dataset.dt, colloTime);
        const phys = onData.add(onCollo).mul(0.5) as tf.Scalar;
        kept.data = tf.keep(data.clone());
        kept.phys = tf.keep(phys.clone());
        return data.add(phys.mul(options.lambda)) as tf.Scalar;
      }, true, variablesOf(model));
      if (!total || !kept.data || !kept.phys) throw new Error("Spring training step produced an empty gradient");
      dataLoss = kept.data.dataSync()[0];
      physicsLoss = kept.phys.dataSync()[0];
      total.dispose();
      kept.data.dispose();
      kept.phys.dispose();
      options.onProgress?.({
        model: options.physics ? "pinn" : "nn",
        step: step + 1,
        steps: options.steps,
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
    times.dispose();
    colloFeatures.dispose();
    colloStates.dispose();
    colloTimes.dispose();
    scale.dispose();
  }
  return { dataLoss, physicsLoss };
}

export function rolloutSpring(
  model: tf.LayersModel,
  params: SpringParams,
  initial: ArrayLike<number>,
  steps: number,
): Float32Array {
  const scale = tf.tensor1d([DX, DV]);
  const rows: tf.Tensor2D[] = [];
  let state = tf.tensor2d([[initial[0], initial[1]]]);
  rows.push(state);
  let t = 0;
  try {
    for (let step = 0; step < steps; step++) {
      const phase = params.driveOmega * t;
      const next = tf.tidy(() => {
        const x = state.slice([0, 0], [1, 1]);
        const v = state.slice([0, 1], [1, 1]);
        const wave = tf.tensor2d([[Math.sin(phase), Math.cos(phase)]]);
        const input = tf.concat([x.div(X_SCALE), v.div(V_SCALE), wave], 1);
        const predicted = model.apply(input, { training: false }) as tf.Tensor2D;
        return state.add(predicted.mul(scale)) as tf.Tensor2D;
      });
      rows.push(next);
      state = next;
      t += MODEL_DT;
    }
    const stacked = tf.concat(rows, 0);
    const out = new Float32Array(stacked.dataSync());
    stacked.dispose();
    return out;
  } finally {
    scale.dispose();
    for (const row of rows) row.dispose();
  }
}

export interface SpringTrainResult {
  trainPairs: number;
  basePairs: number;
  fraction: number;
  lambda: number;
  dt: number;
  steps: number;
  nnLoss: number;
  pinnLoss: number;
  params: SpringParams;
}

export class SpringSession {
  private nn: tf.LayersModel | null = null;
  private pinn: tf.LayersModel | null = null;
  private source: "pretrained" | "trained" | null = null;

  async train(
    request: { fraction: number; lambda?: number; params: SpringParams; seed?: number; steps?: number },
    onProgress?: (progress: TrainProgress) => void,
    shouldStop?: () => boolean,
  ): Promise<SpringTrainResult> {
    this.clear();
    const fraction = request.fraction;
    const lambda = request.lambda ?? DEFAULT_LAMBDA;
    const seed = request.seed ?? SEED;
    const steps = request.steps ?? SPRING_LIVE_STEPS;
    const params = { ...request.params };
    const dataset = buildSpringDataset({ params, fraction, seed });
    const nn = createModel(seed, HIDDEN, { inputs: INPUTS, outputs: 2 });
    const pinn = createModel(seed, HIDDEN, { inputs: INPUTS, outputs: 2 });
    this.nn = nn;
    this.pinn = pinn;
    try {
      const nnResult = await trainOne(nn, dataset, {
        physics: false,
        lambda,
        steps,
        seed: seed + 50,
        onProgress,
        shouldStop,
      });
      if (shouldStop?.()) throw new Error("cancelled");
      const pinnResult = await trainOne(pinn, dataset, {
        physics: true,
        lambda,
        steps,
        seed: seed + 50,
        onProgress,
        shouldStop,
      });
      this.source = "trained";
      return {
        trainPairs: dataset.count,
        basePairs: dataset.basePairs,
        fraction,
        lambda,
        dt: MODEL_DT,
        steps,
        nnLoss: nnResult.dataLoss,
        pinnLoss: pinnResult.dataLoss,
        params,
      };
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  async loadPretrained(origin: string): Promise<void> {
    if (this.source === "pretrained" && this.nn && this.pinn) return;
    const nn = await tf.loadLayersModel(new URL("/models/spring-mass/nn/model.json", origin).href);
    let pinn: tf.LayersModel;
    try {
      pinn = await tf.loadLayersModel(new URL("/models/spring-mass/pinn/model.json", origin).href);
    } catch (error) {
      nn.dispose();
      throw error;
    }
    this.clear();
    this.nn = nn;
    this.pinn = pinn;
    this.source = "pretrained";
  }

  rollout(initial: ArrayLike<number>, seconds: number, params: SpringParams): {
    nn: Float32Array;
    pinn: Float32Array;
    dt: number;
  } {
    if (!this.nn || !this.pinn) throw new Error("Train the spring models first");
    const steps = Math.max(1, Math.round(seconds / MODEL_DT));
    return {
      nn: rolloutSpring(this.nn, params, initial, steps),
      pinn: rolloutSpring(this.pinn, params, initial, steps),
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

function truthOf(initial: ArrayLike<number>, params: SpringParams, steps: number): Float32Array {
  const out = new Float32Array((steps + 1) * 2);
  const state = new Float64Array([initial[0], initial[1]]);
  out[0] = state[0];
  out[1] = state[1];
  let t = 0;
  for (let i = 1; i <= steps; i++) {
    t = advance(state, params, t);
    out[i * 2] = state[0];
    out[i * 2 + 1] = state[1];
  }
  return out;
}

function score(predicted: Float32Array, truth: Float32Array, params: SpringParams) {
  const samples = predicted.length / 2;
  let squared = 0;
  let absolute = 0;
  let count = 0;
  for (let i = 1; i < samples; i++) {
    for (let d = 0; d < 2; d++) {
      const error = predicted[i * 2 + d] - truth[i * 2 + d];
      squared += error * error;
      absolute += Math.abs(error);
      count++;
    }
  }
  const end = (samples - 1) * 2;
  const e0 = springEnergy(predicted.subarray(0, 2), params).total;
  const eT = springEnergy(predicted.subarray(end, end + 2), params).total;
  return {
    mse: squared / count,
    mae: absolute / count,
    energyDrift: Math.abs(eT - e0) / Math.max(Math.abs(e0), 1e-9),
  };
}

/** Full-data weights for the lab's default spring. Caller owns and disposes the models. */
export async function fitSpring(steps = 400, params: SpringParams = { ...DEFAULT_SPRING }, fraction = 1) {
  const dataset = buildSpringDataset({ params, fraction, seed: SEED });
  const nn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 2 });
  const pinn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 2 });
  await trainOne(nn, dataset, { physics: false, lambda: DEFAULT_LAMBDA, steps, seed: SEED + 50 });
  await trainOne(pinn, dataset, { physics: true, lambda: DEFAULT_LAMBDA, steps, seed: SEED + 50 });
  return { nn, pinn, params };
}

/** One 5% fit, scored at 2 s and 10 s. Undamped, so energy drift is conservation error. */
export async function runSpringExperiment(steps = SPRING_HEADLESS_STEPS): Promise<ResultRow[]> {
  const params: SpringParams = { ...DEFAULT_SPRING, c: 0, driveAmp: 0 };
  const dataset = buildSpringDataset({
    params,
    fraction: 0.05,
    seed: SEED,
    trajectories: 8,
    seconds: 3,
  });
  const nn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 2 });
  const pinn = createModel(SEED, HIDDEN, { inputs: INPUTS, outputs: 2 });
  try {
    await trainOne(nn, dataset, { physics: false, lambda: DEFAULT_LAMBDA, steps, seed: SEED + 50 });
    await trainOne(pinn, dataset, { physics: true, lambda: DEFAULT_LAMBDA, steps, seed: SEED + 50 });
    const rng = mulberry32(SEED + 99);
    const initials = Array.from({ length: 4 }, () => [(rng() * 2 - 1) * 0.9, (rng() * 2 - 1) * 1.2]);
    const horizons = [2, 10];
    return horizons.map((horizon) => {
      const horizonSteps = Math.round(horizon / MODEL_DT);
      const rows = initials.map((initial) => {
        const clock = performance.now();
        const predictedNn = rolloutSpring(nn, params, initial, horizonSteps);
        const nnMs = (performance.now() - clock) / horizonSteps;
        const clockP = performance.now();
        const predictedPinn = rolloutSpring(pinn, params, initial, horizonSteps);
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
        id: `ES-${horizon}`,
        experiment: "ES" as const,
        name: "Spring-mass",
        setting: "undamped, 5% of the data, hidden [32, 32], state MSE in m and m/s",
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
