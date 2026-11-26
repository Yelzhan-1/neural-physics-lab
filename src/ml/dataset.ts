import { DEFAULT_PARAMS, type PendulumParams } from "../engine";
import {
  COLLOCATION,
  MODEL_DT,
  TEST_SECONDS,
  TEST_TRAJECTORIES,
  TRAIN_SECONDS,
  TRAIN_TRAJECTORIES,
} from "./constants";
import { integrateTrajectory } from "./integrate";
import { mulberry32, shuffleIndices } from "./rng";

export interface DatasetConfig {
  seed: number;
  params?: PendulumParams;
  dt?: number;
  /** Seconds of each training trajectory. */
  trainSeconds?: number;
  /** Seconds of each held-out trajectory. Long enough for the 10 s horizon. */
  testSeconds?: number;
  trainTrajectories?: number;
  testTrajectories?: number;
  /** Fraction of shuffled training pairs to keep. 0.05 is the 5% setting. */
  fraction?: number;
  /** Smallest |angle| of a sampled initial condition, radians. */
  angleMin: number;
  angleMax: number;
  /** When set, test trajectories are drawn from this other angle range. */
  testAngleMin?: number;
  testAngleMax?: number;
  /** Initial |ω| is uniform in [0, omegaMax]. Zero means released from rest. */
  omegaMax?: number;
  /** Share of training trajectories released with zero angular velocity. */
  restFraction?: number;
  collocation?: number;
  /** Collocation angles are uniform in ±this value. */
  collocationAngle?: number;
  collocationOmega?: number;
}

export interface Dataset {
  dt: number;
  params: PendulumParams;
  seed: number;
  fraction: number;
  /** Pairs before the fraction cut. */
  basePairs: number;
  /** Current state of each training pair, length count * 4. */
  trainState: Float32Array;
  /** Next state one model step later. */
  trainNext: Float32Array;
  count: number;
  /** Held-out trajectories packed back to back, each (testSteps + 1) * 4 long. */
  testStates: Float32Array;
  testSteps: number;
  testCount: number;
  /** Random states with no labels, length collocationCount * 4. */
  collocation: Float32Array;
}

function sampleAngle(rng: () => number, min: number, max: number): number {
  const magnitude = min + rng() * (max - min);
  return (rng() < 0.5 ? -1 : 1) * magnitude;
}

function sampleInitial(
  rng: () => number,
  angleMin: number,
  angleMax: number,
  omegaMax: number,
  fromRest: boolean,
): [number, number, number, number] {
  return [
    sampleAngle(rng, angleMin, angleMax),
    sampleAngle(rng, angleMin, angleMax),
    fromRest ? 0 : (rng() * 2 - 1) * omegaMax,
    fromRest ? 0 : (rng() * 2 - 1) * omegaMax,
  ];
}

/**
 * Builds the shared dataset for one comparison.
 * Training pairs are shuffled with `seed` and then cut to `fraction`, so 5%
 * is a prefix of 10% and of 100%. Test trajectories never enter the cut.
 * Collocation states are unlabeled and cover the wide operating range.
 */
export function generateDataset(config: DatasetConfig): Dataset {
  const params = { ...(config.params ?? DEFAULT_PARAMS) };
  const dt = config.dt ?? MODEL_DT;
  const fraction = config.fraction ?? 1;
  if (!(fraction > 0 && fraction <= 1)) {
    throw new RangeError("fraction must be in (0, 1]");
  }
  const trainSeconds = config.trainSeconds ?? TRAIN_SECONDS;
  const testSeconds = config.testSeconds ?? TEST_SECONDS;
  const trainTrajectories = config.trainTrajectories ?? TRAIN_TRAJECTORIES;
  const testTrajectories = config.testTrajectories ?? TEST_TRAJECTORIES;
  const trainSteps = Math.round(trainSeconds / dt);
  const testSteps = Math.round(testSeconds / dt);
  const omegaMax = config.omegaMax ?? 1;
  const restFraction = config.restFraction ?? 0.5;
  const testAngleMin = config.testAngleMin ?? config.angleMin;
  const testAngleMax = config.testAngleMax ?? config.angleMax;

  const rng = mulberry32(config.seed);
  const pairCount = trainTrajectories * trainSteps;
  const poolState = new Float32Array(pairCount * 4);
  const poolNext = new Float32Array(pairCount * 4);

  for (let t = 0; t < trainTrajectories; t++) {
    const initial = sampleInitial(
      rng,
      config.angleMin,
      config.angleMax,
      omegaMax,
      rng() < restFraction,
    );
    const trajectory = integrateTrajectory(initial, params, trainSteps, dt);
    const offset = t * trainSteps;
    for (let step = 0; step < trainSteps; step++) {
      const from = step * 4;
      const to = (offset + step) * 4;
      poolState.set(trajectory.subarray(from, from + 4), to);
      poolNext.set(trajectory.subarray(from + 4, from + 8), to);
    }
  }

  const order = shuffleIndices(pairCount, mulberry32(config.seed + 1));
  const count = Math.max(1, Math.round(pairCount * fraction));
  const trainState = new Float32Array(count * 4);
  const trainNext = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const from = order[i] * 4;
    trainState.set(poolState.subarray(from, from + 4), i * 4);
    trainNext.set(poolNext.subarray(from, from + 4), i * 4);
  }

  const testStates = new Float32Array(testTrajectories * (testSteps + 1) * 4);
  const stride = (testSteps + 1) * 4;
  for (let t = 0; t < testTrajectories; t++) {
    const initial = sampleInitial(rng, testAngleMin, testAngleMax, omegaMax, true);
    const trajectory = integrateTrajectory(initial, params, testSteps, dt);
    testStates.set(trajectory, t * stride);
  }

  const colloCount = config.collocation ?? COLLOCATION;
  const colloAngle = config.collocationAngle ?? Math.PI;
  const colloOmega = config.collocationOmega ?? 8;
  const colloRng = mulberry32(config.seed + 2);
  const collocation = new Float32Array(colloCount * 4);
  for (let i = 0; i < colloCount; i++) {
    const o = i * 4;
    collocation[o] = (colloRng() * 2 - 1) * colloAngle;
    collocation[o + 1] = (colloRng() * 2 - 1) * colloAngle;
    collocation[o + 2] = (colloRng() * 2 - 1) * colloOmega;
    collocation[o + 3] = (colloRng() * 2 - 1) * colloOmega;
  }

  return {
    dt,
    params,
    seed: config.seed,
    fraction,
    basePairs: pairCount,
    trainState,
    trainNext,
    count,
    testStates,
    testSteps,
    testCount: testTrajectories,
    collocation,
  };
}

/** Initial state of held-out trajectory `index`. */
export function testInitial(dataset: Dataset, index: number): Float32Array {
  const stride = (dataset.testSteps + 1) * 4;
  return dataset.testStates.subarray(index * stride, index * stride + 4);
}

/** Reference samples of held-out trajectory `index` up to `steps` model steps. */
export function testSlice(dataset: Dataset, index: number, steps: number): Float32Array {
  const stride = (dataset.testSteps + 1) * 4;
  const start = index * stride;
  const count = Math.min(steps, dataset.testSteps) + 1;
  return dataset.testStates.subarray(start, start + count * 4);
}
