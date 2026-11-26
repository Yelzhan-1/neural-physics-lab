import { DEFAULT_DT, rk4Step, type PendulumParams } from "@/engine";

const TIP_GAP = 0.28;

function tip(state: ArrayLike<number>, l1: number, l2: number): { x: number; y: number } {
  return {
    x: l1 * Math.sin(state[0]) + l2 * Math.sin(state[1]),
    y: -l1 * Math.cos(state[0]) - l2 * Math.cos(state[1]),
  };
}

/**
 * Time, in seconds, just before the standard NN tip leaves the RK4 tip.
 * The caller plays from here so the split is what the audience sees.
 */
export function divergenceTime(
  trajectory: ArrayLike<number>,
  dt: number,
  params: PendulumParams,
  initial: ArrayLike<number>,
): number {
  const samples = Math.floor(trajectory.length / 4) - 1;
  if (samples < 2) return 0;
  const state = new Float64Array([initial[0], initial[1], initial[2], initial[3]]);
  const sub = Math.max(1, Math.round(dt / DEFAULT_DT));
  const step = dt / sub;
  let crossed = samples * dt;
  for (let i = 1; i <= samples; i++) {
    for (let s = 0; s < sub; s++) rk4Step(state, params, step, state);
    const truth = tip(state, params.l1, params.l2);
    const offset = i * 4;
    const guess = tip(
      [trajectory[offset], trajectory[offset + 1], trajectory[offset + 2], trajectory[offset + 3]],
      params.l1,
      params.l2,
    );
    if (Math.hypot(truth.x - guess.x, truth.y - guess.y) > TIP_GAP) {
      crossed = i * dt;
      break;
    }
  }
  return Math.max(0, crossed - 0.6);
}
