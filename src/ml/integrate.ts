import { rk4Step, type PendulumParams, type PendulumState } from "../engine";
import { MODEL_DT, SUBSTEPS } from "./constants";

/** One model step: `SUBSTEPS` classical RK4 steps of size `dt / SUBSTEPS`. */
export function advance(
  state: Float64Array,
  params: PendulumParams,
  dt: number = MODEL_DT,
): void {
  const subDt = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) rk4Step(state, params, subDt, state);
}

/**
 * Ground-truth trajectory, including the initial state. Integration is float64;
 * stored samples are float32, which is what the scene and the network consume.
 */
export function integrateTrajectory(
  initial: PendulumState,
  params: PendulumParams,
  steps: number,
  dt: number = MODEL_DT,
): Float32Array {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new RangeError("steps must be a non-negative integer");
  }
  const out = new Float32Array((steps + 1) * 4);
  const state = new Float64Array(4);
  for (let i = 0; i < 4; i++) state[i] = initial[i];
  out.set(state, 0);
  for (let step = 1; step <= steps; step++) {
    advance(state, params, dt);
    out.set(state, step * 4);
  }
  return out;
}

/** Milliseconds per model step of the reference integrator, after a warmup. */
export function timeReference(params: PendulumParams, dt: number = MODEL_DT): number {
  const state = Float64Array.from([1.1, -0.4, 0.2, -0.1]);
  for (let i = 0; i < 30; i++) advance(state, params, dt);
  const steps = 400;
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) advance(state, params, dt);
  return (performance.now() - t0) / steps;
}
