import { DEFAULT_PARAMS, simulate } from "../src/engine";
import { MODEL_DT } from "../src/ml/constants";

process.env.TF_CPP_MIN_LOG_LEVEL ??= "2";

function tip(state: ArrayLike<number>): { x: number; y: number } {
  const l1 = DEFAULT_PARAMS.l1;
  const l2 = DEFAULT_PARAMS.l2;
  return {
    x: l1 * Math.sin(state[0]) + l2 * Math.sin(state[1]),
    y: -l1 * Math.cos(state[0]) - l2 * Math.cos(state[1]),
  };
}

function tipError(guess: ArrayLike<number>, truth: ArrayLike<number>): number {
  const a = tip(guess);
  const b = tip(truth);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function main(): Promise<void> {
  await import("@tensorflow/tfjs-node");
  const tf = await import("@tensorflow/tfjs");
  const { rolloutModel } = await import("../src/ml/predict");
  const root = "public/models/double-pendulum";
  const nn = await tf.loadLayersModel(`file://${process.cwd()}/${root}/nn/model.json`);
  const pinn = await tf.loadLayersModel(`file://${process.cwd()}/${root}/pinn/model.json`);
  const steps = Math.round(3 / MODEL_DT);
  const poses: [number, number][] = [];
  for (const a of [70, 90, 110, 130, 150, 170]) {
    for (const b of [-160, -120, -80, -40, 20, 60, 100, 140]) poses.push([a, b]);
  }
  const rows: { a: number; b: number; nn: number; pinn: number; gap: number }[] = [];
  for (const [deg1, deg2] of poses) {
    const initial = [(deg1 * Math.PI) / 180, (deg2 * Math.PI) / 180, 0, 0];
    const truth = simulate(initial, DEFAULT_PARAMS, steps, MODEL_DT);
    const nnRoll = rolloutModel(nn, initial, steps, MODEL_DT);
    const pinnRoll = rolloutModel(pinn, initial, steps, MODEL_DT);
    const end = steps * 4;
    const nnErr = tipError(nnRoll.subarray(end, end + 4), truth.subarray(end, end + 4));
    const pinnErr = tipError(pinnRoll.subarray(end, end + 4), truth.subarray(end, end + 4));
    rows.push({ a: deg1, b: deg2, nn: nnErr, pinn: pinnErr, gap: nnErr - pinnErr });
  }
  rows.sort((p, q) => q.gap - p.gap);
  for (const row of rows.slice(0, 12)) {
    console.log(
      `${row.a} ${row.b}  nn ${row.nn.toFixed(3)}  pinn ${row.pinn.toFixed(3)}  gap ${row.gap.toFixed(3)}`,
    );
  }
  nn.dispose();
  pinn.dispose();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
