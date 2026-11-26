import * as tf from "@tensorflow/tfjs";
import { DEFAULT_PARAMS, type PendulumParams } from "../engine";
import {
  DEFAULT_LAMBDA,
  EXPERIMENT_STEPS,
  HIDDEN_UNITS,
  LEARNING_RATE,
  MODEL_DT,
  SEED,
  BATCH_SIZE,
} from "./constants";
import { generateDataset, testInitial, testSlice, type Dataset, type DatasetConfig } from "./dataset";
import { timeReference } from "./integrate";
import { averageMetrics, trajectoryError, type ModelMetrics } from "./metrics";
import { rolloutModel, timeModel } from "./predict";
import { takeaway, winnerOf, type ResultRow, type ResultsFile } from "./results";
import { CancelledError, createModel, trainModel, type TrainProgress } from "./train";
import type { ExperimentId } from "./messages";

export type { ExperimentId };
export { CancelledError };

export interface ExperimentHooks {
  onProgress?: (progress: TrainProgress) => void;
  shouldStop?: () => boolean;
  steps?: number;
  lambda?: number;
  seed?: number;
  params?: PendulumParams;
}

const STANDARD_ANGLES = {
  angleMin: 0.2,
  angleMax: 2.2,
  omegaMax: 1.2,
  restFraction: 0.5,
} as const;

interface Fitted {
  dataset: Dataset;
  nn: tf.LayersModel;
  pinn: tf.LayersModel;
  nnMs: number;
  pinnMs: number;
}

function stop(hooks: ExperimentHooks): void {
  if (hooks.shouldStop?.()) throw new CancelledError();
}

async function fit(config: DatasetConfig, hooks: ExperimentHooks, lambda: number): Promise<Fitted> {
  const dataset = generateDataset(config);
  const nn = createModel(config.seed);
  const pinn = createModel(config.seed);
  const steps = hooks.steps ?? EXPERIMENT_STEPS;
  try {
    await trainModel(nn, dataset, {
      physics: false,
      lambda,
      steps,
      scheduleSeed: config.seed + 50,
      onProgress: hooks.onProgress,
      shouldStop: hooks.shouldStop,
    });
    stop(hooks);
    await trainModel(pinn, dataset, {
      physics: true,
      lambda,
      steps,
      scheduleSeed: config.seed + 50,
      onProgress: hooks.onProgress,
      shouldStop: hooks.shouldStop,
    });
    stop(hooks);
    return {
      dataset,
      nn,
      pinn,
      nnMs: timeModel(nn, dataset.dt),
      pinnMs: timeModel(pinn, dataset.dt),
    };
  } catch (error) {
    nn.dispose();
    pinn.dispose();
    throw error;
  }
}

function disposeFitted(fitted: Fitted): void {
  fitted.nn.dispose();
  fitted.pinn.dispose();
}

function score(model: tf.LayersModel, dataset: Dataset, horizonSeconds: number, msPerStep: number): ModelMetrics {
  const steps = Math.max(1, Math.round(horizonSeconds / dataset.dt));
  const rows = [];
  for (let i = 0; i < dataset.testCount; i++) {
    const predicted = rolloutModel(model, testInitial(dataset, i), steps, dataset.dt);
    rows.push(trajectoryError(predicted, testSlice(dataset, i, steps), dataset.params));
  }
  return averageMetrics(rows, msPerStep);
}

function makeRow(
  fitted: Fitted,
  meta: Pick<ResultRow, "id" | "experiment" | "name" | "setting">,
  horizonSeconds: number,
): ResultRow {
  const nn = score(fitted.nn, fitted.dataset, horizonSeconds, fitted.nnMs);
  const pinn = score(fitted.pinn, fitted.dataset, horizonSeconds, fitted.pinnMs);
  return {
    ...meta,
    horizonSeconds,
    trainPairs: fitted.dataset.count,
    basePairs: fitted.dataset.basePairs,
    testTrajectories: fitted.dataset.testCount,
    nn,
    pinn,
    winner: winnerOf(nn.mse, pinn.mse),
  };
}

function standardConfig(hooks: ExperimentHooks, fraction: number): DatasetConfig {
  return {
    seed: hooks.seed ?? SEED,
    params: hooks.params ?? { ...DEFAULT_PARAMS },
    fraction,
    ...STANDARD_ANGLES,
  };
}

async function runStandard(hooks: ExperimentHooks, horizons: number[], ids: string[]): Promise<ResultRow[]> {
  const lambda = hooks.lambda ?? DEFAULT_LAMBDA;
  const fitted = await fit(standardConfig(hooks, 1), hooks, lambda);
  try {
    return horizons.map((horizon, index) =>
      makeRow(
        fitted,
        {
          id: ids[index],
          experiment: ids[index].startsWith("E4") ? "E4" : "E1",
          name: ids[index].startsWith("E4") ? "Long-term prediction" : "Standard conditions",
          setting: ids[index].startsWith("E4")
            ? `full data, error over ${horizon} s`
            : "100% of the data, held-out trajectories",
        },
        horizon,
      ),
    );
  } finally {
    disposeFitted(fitted);
  }
}

async function runLimited(hooks: ExperimentHooks): Promise<ResultRow[]> {
  const lambda = hooks.lambda ?? DEFAULT_LAMBDA;
  const rows: ResultRow[] = [];
  for (const fraction of [0.05, 0.1]) {
    const fitted = await fit(standardConfig(hooks, fraction), hooks, lambda);
    try {
      const percent = Math.round(fraction * 100);
      rows.push(
        makeRow(
          fitted,
          {
            id: `E2-${percent}`,
            experiment: "E2",
            name: "Limited training data",
            setting: `${percent}% of the data, same held-out trajectories`,
          },
          2,
        ),
      );
    } finally {
      disposeFitted(fitted);
    }
  }
  return rows;
}

async function runUnseen(hooks: ExperimentHooks): Promise<ResultRow[]> {
  const lambda = hooks.lambda ?? DEFAULT_LAMBDA;
  const fitted = await fit(
    {
      seed: hooks.seed ?? SEED,
      params: hooks.params ?? { ...DEFAULT_PARAMS },
      fraction: 1,
      angleMin: 0.05,
      angleMax: 0.4,
      testAngleMin: 1.15,
      testAngleMax: 2.35,
      omegaMax: 0,
      restFraction: 1,
    },
    hooks,
    lambda,
  );
  try {
    return [
      makeRow(
        fitted,
        {
          id: "E3",
          experiment: "E3",
          name: "Unseen initial conditions",
          setting: "trained on small angles, tested on large angles",
        },
        2,
      ),
    ];
  } finally {
    disposeFitted(fitted);
  }
}

/** Runs one experiment from scratch. E4 trains the standard-conditions models, then scores 1 s, 3 s and 10 s. */
export async function runExperiment(id: ExperimentId, hooks: ExperimentHooks = {}): Promise<ResultRow[]> {
  if (id === "E1") return runStandard(hooks, [2], ["E1"]);
  if (id === "E2") return runLimited(hooks);
  if (id === "E3") return runUnseen(hooks);
  return runStandard(hooks, [1, 3, 10], ["E4-1", "E4-3", "E4-10"]);
}

/** All four experiments. E4 reuses the E1 networks instead of training them twice. */
export async function runAllExperiments(hooks: ExperimentHooks = {}): Promise<ResultsFile> {
  const params = hooks.params ?? { ...DEFAULT_PARAMS };
  const lambda = hooks.lambda ?? DEFAULT_LAMBDA;
  const seed = hooks.seed ?? SEED;
  const fitted = await fit(standardConfig(hooks, 1), hooks, lambda);
  const rows: ResultRow[] = [];
  try {
    rows.push(
      makeRow(
        fitted,
        {
          id: "E1",
          experiment: "E1",
          name: "Standard conditions",
          setting: "100% of the data, held-out trajectories",
        },
        2,
      ),
    );
    for (const horizon of [1, 3, 10]) {
      rows.push(
        makeRow(
          fitted,
          {
            id: `E4-${horizon}`,
            experiment: "E4",
            name: "Long-term prediction",
            setting: `full data, error over ${horizon} s`,
          },
          horizon,
        ),
      );
    }
  } finally {
    disposeFitted(fitted);
  }
  const limited = await runLimited(hooks);
  const unseen = await runUnseen(hooks);
  const ordered = [
    ...rows.filter((row) => row.experiment === "E1"),
    ...limited,
    ...unseen,
    ...rows.filter((row) => row.experiment === "E4"),
  ];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    backend: tf.getBackend(),
    seed,
    dt: MODEL_DT,
    hidden: [...HIDDEN_UNITS],
    optimizerSteps: hooks.steps ?? EXPERIMENT_STEPS,
    batchSize: BATCH_SIZE,
    learningRate: LEARNING_RATE,
    lambda,
    rk4MsPerStep: timeReference(params),
    rows: ordered,
    takeaway: takeaway(ordered),
  };
}

export { formatResultsMarkdown } from "./results";
