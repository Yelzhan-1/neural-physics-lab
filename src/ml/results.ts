import type { ModelMetrics } from "./metrics";

export type { ModelMetrics };

export type Winner = "nn" | "pinn" | "tie";

export interface ResultRow {
  id: string;
  experiment: "E1" | "E2" | "E3" | "E4" | "ES" | "EP" | "EO";
  name: string;
  setting: string;
  horizonSeconds: number;
  trainPairs: number;
  basePairs: number;
  testTrajectories: number;
  nn: ModelMetrics;
  pinn: ModelMetrics;
  /** Lower rollout MSE. A gap under 2% is a tie. */
  winner: Winner;
}

export interface SeedSummary {
  id: "E1" | "E2-5";
  name: string;
  seeds: number[];
  nnMseMean: number;
  nnMseStd: number;
  pinnMseMean: number;
  pinnMseStd: number;
  nnDriftMean: number;
  nnDriftStd: number;
  pinnDriftMean: number;
  pinnDriftStd: number;
}

/** What the MSE number means. Stored with the results so a reader does not have to guess. */
export const MSE_NOTE =
  "MSE and MAE are the mean squared and mean absolute error of the state error (Δθ₁, Δθ₂, Δω₁, Δω₂). Angles are in radians and angular velocities are in rad/s, averaged over those four components and over the rollout after t = 0.";

/** What the energy-drift number means. */
export const DRIFT_NOTE =
  "Energy drift is relative: |E(T) − E(0)| / |E(0)|, using the model's own total energy at the start and end of the horizon.";

export interface ResultsFile {
  version: 1;
  generatedAt: string;
  backend: string;
  seed: number;
  dt: number;
  hidden: number[];
  optimizerSteps: number;
  batchSize: number;
  learningRate: number;
  learningRateEnd?: number;
  lambda: number;
  rk4MsPerStep: number;
  mseNote?: string;
  driftNote?: string;
  rows: ResultRow[];
  seeds?: SeedSummary[];
  takeaway: string;
}

export function meanStd(values: number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) return { mean: Number.NaN, std: Number.NaN };
  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / n;
  if (n === 1) return { mean, std: 0 };
  let square = 0;
  for (const value of values) {
    const delta = value - mean;
    square += delta * delta;
  }
  return { mean, std: Math.sqrt(square / (n - 1)) };
}

export function seedSummary(id: SeedSummary["id"], name: string, seeds: number[], rows: ResultRow[]): SeedSummary {
  if (seeds.length !== rows.length || rows.length === 0) {
    throw new RangeError("seed summary needs one row per seed");
  }
  const nnMse = meanStd(rows.map((row) => row.nn.mse));
  const pinnMse = meanStd(rows.map((row) => row.pinn.mse));
  const nnDrift = meanStd(rows.map((row) => row.nn.energyDrift));
  const pinnDrift = meanStd(rows.map((row) => row.pinn.energyDrift));
  return {
    id,
    name,
    seeds,
    nnMseMean: nnMse.mean,
    nnMseStd: nnMse.std,
    pinnMseMean: pinnMse.mean,
    pinnMseStd: pinnMse.std,
    nnDriftMean: nnDrift.mean,
    nnDriftStd: nnDrift.std,
    pinnDriftMean: pinnDrift.mean,
    pinnDriftStd: pinnDrift.std,
  };
}

/** Lower MSE wins. Within 2% of the larger value, call it a tie. */
export function winnerOf(nnMse: number, pinnMse: number): Winner {
  const scale = Math.max(Math.abs(nnMse), Math.abs(pinnMse), 1e-12);
  if (Math.abs(nnMse - pinnMse) / scale < 0.02) return "tie";
  return nnMse < pinnMse ? "nn" : "pinn";
}

export function formatMetric(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 0.01 || abs >= 100)) return value.toExponential(2);
  return value.toFixed(3);
}

function modelName(winner: Winner): string {
  if (winner === "pinn") return "PINN";
  if (winner === "nn") return "Standard NN";
  return "neither model";
}

function findRow(rows: ResultRow[], id: string): ResultRow | undefined {
  return rows.find((row) => row.id === id);
}

function plusMinus(mean: number, std: number): string {
  return `${formatMetric(mean)} ± ${formatMetric(std)}`;
}

/** One or two sentences, using only the numbers in `rows` and, when present, the seed sweep. */
export function takeaway(rows: ResultRow[], seeds: SeedSummary[] = []): string {
  const e1 = findRow(rows, "E1");
  const e2 = findRow(rows, "E2-5");
  const e3 = findRow(rows, "E3");
  const short = findRow(rows, "E4-1");
  const long = findRow(rows, "E4-10");
  if (!e1 || !e2 || !e3 || !short || !long) return "Results are incomplete.";

  const full = e1.winner === "tie"
    ? `On the full dataset the rollout MSEs are within 2% (${formatMetric(e1.nn.mse)} for the standard NN, ${formatMetric(e1.pinn.mse)} for the PINN)`
    : `On the full dataset ${modelName(e1.winner)} has the lower rollout MSE (${formatMetric(e1.winner === "nn" ? e1.nn.mse : e1.pinn.mse)} against ${formatMetric(e1.winner === "nn" ? e1.pinn.mse : e1.nn.mse)})`;

  const ratio = e2.nn.mse / Math.max(e2.pinn.mse, 1e-12);
  let limited: string;
  if (e2.winner === "pinn" && ratio >= 1.05) {
    limited = `with 5% of the data the PINN rollout MSE is ${ratio.toFixed(1)}× lower`;
  } else if (e2.winner === "nn") {
    const inverse = e2.pinn.mse / Math.max(e2.nn.mse, 1e-12);
    limited = `with 5% of the data the standard NN still wins, at ${inverse.toFixed(1)}× lower rollout MSE`;
  } else {
    limited = "with 5% of the data the two rollout MSEs are within 2%";
  }

  const unseen = e3.winner === "tie"
    ? "on large angles held out of training they are tied"
    : `on large angles held out of training ${modelName(e3.winner)} wins`;

  const nnGrowth = long.nn.mse / Math.max(short.nn.mse, 1e-12);
  const pinnGrowth = long.pinn.mse / Math.max(short.pinn.mse, 1e-12);
  const base = `${full}; ${limited}, and ${unseen}. By 10 s both errors have grown (standard NN ×${nnGrowth.toFixed(0)}, PINN ×${pinnGrowth.toFixed(0)} from 1 s), which a chaotic pendulum is expected to do.`;
  const e1Seeds = seeds.find((item) => item.id === "E1");
  const e2Seeds = seeds.find((item) => item.id === "E2-5");
  if (!e1Seeds || !e2Seeds) return base;
  const listed = e1Seeds.seeds.join(", ");
  return `${base} Across seeds ${listed}, E1 PINN MSE is ${plusMinus(e1Seeds.pinnMseMean, e1Seeds.pinnMseStd)} (standard NN ${plusMinus(e1Seeds.nnMseMean, e1Seeds.nnMseStd)}) and the 5% PINN MSE is ${plusMinus(e2Seeds.pinnMseMean, e2Seeds.pinnMseStd)} (standard NN ${plusMinus(e2Seeds.nnMseMean, e2Seeds.nnMseStd)}).`;
}

export function formatResultsMarkdown(results: ResultsFile): string {
  const lines = [
    "# Experiment results",
    "",
    results.takeaway,
    "",
    `Generated ${results.generatedAt} on the \`${results.backend}\` backend.`,
    `Seed ${results.seed}, dt ${results.dt} s, hidden layers [${results.hidden.join(", ")}], ${results.optimizerSteps} optimizer steps, batch ${results.batchSize}, learning rate ${results.learningRate} cosine to ${results.learningRateEnd ?? results.learningRate}, λ ${results.lambda}.`,
    `RK4 reference speed: ${formatMetric(results.rk4MsPerStep)} ms per model step.`,
    "",
    results.mseNote ?? MSE_NOTE,
    results.driftNote ?? DRIFT_NOTE,
    "",
    "Errors are autoregressive rollout error against RK4, not one-step error. The winner is the lower rollout MSE. A gap under 2% is a tie.",
    "",
    "| Experiment | Setting | Horizon | Train pairs | NN MSE | PINN MSE | NN MAE | PINN MAE | NN \\|ΔE\\|/\\|E0\\| | PINN \\|ΔE\\|/\\|E0\\| | NN ms/step | PINN ms/step | Winner |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const row of results.rows) {
    lines.push(
      `| ${row.name} | ${row.setting} | ${row.horizonSeconds} s | ${row.trainPairs} | ${formatMetric(row.nn.mse)} | ${formatMetric(row.pinn.mse)} | ${formatMetric(row.nn.mae)} | ${formatMetric(row.pinn.mae)} | ${formatMetric(row.nn.energyDrift)} | ${formatMetric(row.pinn.energyDrift)} | ${formatMetric(row.nn.msPerStep)} | ${formatMetric(row.pinn.msPerStep)} | ${row.winner === "tie" ? "tie" : row.winner === "nn" ? "Standard NN" : "PINN"} |`,
    );
  }
  if (results.seeds && results.seeds.length > 0) {
    lines.push(
      "",
      "Seed sweep, same budget, sample standard deviation (n − 1):",
      "",
      "| Run | Seeds | NN MSE | PINN MSE | NN \\|ΔE\\|/\\|E0\\| | PINN \\|ΔE\\|/\\|E0\\| |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const item of results.seeds) {
      lines.push(
        `| ${item.name} | ${item.seeds.join(", ")} | ${plusMinus(item.nnMseMean, item.nnMseStd)} | ${plusMinus(item.pinnMseMean, item.pinnMseStd)} | ${plusMinus(item.nnDriftMean, item.nnDriftStd)} | ${plusMinus(item.pinnDriftMean, item.pinnDriftStd)} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}
