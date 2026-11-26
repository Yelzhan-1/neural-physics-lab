import { energy, type PendulumParams } from "../engine";

export interface ModelMetrics {
  /** Mean squared error of the autoregressive rollout against RK4. */
  mse: number;
  mae: number;
  /** |E(T) − E(0)| / max(|E(0)|, 1e-3) at the end of the horizon. */
  energyDrift: number;
  /** Wall time to advance one model step, milliseconds. */
  msPerStep: number;
}

export function wrapAngle(delta: number): number {
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

/** Path error from the first step after t = 0 through the end of both arrays. */
export function trajectoryError(
  predicted: ArrayLike<number>,
  truth: ArrayLike<number>,
  params: PendulumParams,
): Pick<ModelMetrics, "mse" | "mae" | "energyDrift"> {
  if (predicted.length !== truth.length || predicted.length < 8 || predicted.length % 4 !== 0) {
    throw new RangeError("predicted and truth must be matching state trajectories");
  }
  const samples = predicted.length / 4;
  let squared = 0;
  let absolute = 0;
  let count = 0;
  for (let i = 1; i < samples; i++) {
    const offset = i * 4;
    const dTheta1 = wrapAngle(predicted[offset] - truth[offset]);
    const dTheta2 = wrapAngle(predicted[offset + 1] - truth[offset + 1]);
    const dOmega1 = predicted[offset + 2] - truth[offset + 2];
    const dOmega2 = predicted[offset + 3] - truth[offset + 3];
    squared += dTheta1 * dTheta1 + dTheta2 * dTheta2 + dOmega1 * dOmega1 + dOmega2 * dOmega2;
    absolute += Math.abs(dTheta1) + Math.abs(dTheta2) + Math.abs(dOmega1) + Math.abs(dOmega2);
    count += 4;
  }
  const stateAt = (values: ArrayLike<number>, index: number) => [
    values[index],
    values[index + 1],
    values[index + 2],
    values[index + 3],
  ];
  const initial = energy(stateAt(predicted, 0), params).total;
  const final = energy(stateAt(predicted, (samples - 1) * 4), params).total;
  return {
    mse: squared / count,
    mae: absolute / count,
    energyDrift: Math.abs(final - initial) / Math.max(Math.abs(initial), 1e-3),
  };
}

export function averageMetrics(
  rows: Pick<ModelMetrics, "mse" | "mae" | "energyDrift">[],
  msPerStep: number,
): ModelMetrics {
  const n = rows.length;
  if (n === 0) throw new RangeError("no rows to average");
  let mse = 0;
  let mae = 0;
  let energyDrift = 0;
  for (const row of rows) {
    mse += row.mse;
    mae += row.mae;
    energyDrift += row.energyDrift;
  }
  return { mse: mse / n, mae: mae / n, energyDrift: energyDrift / n, msPerStep };
}
