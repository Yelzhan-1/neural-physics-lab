import { DEFAULT_DT, type Energy } from "./types";

/**
 * Horizontal spring-mass. State is [x, v]: displacement from equilibrium in
 * metres, and velocity in m/s. The wall is to the left and x grows to the right.
 *
 *   m x'' + c x' + k x = A sin(ω t)
 *
 * With c = 0 and A = 0 the total energy ½ m v² + ½ k x² is conserved.
 */
export interface SpringParams {
  /** Mass, kg. */
  m: number;
  /** Spring stiffness, N/m. */
  k: number;
  /** Viscous damping, N·s/m. */
  c: number;
  /** Drive amplitude, N. Zero means the spring is free. */
  driveAmp: number;
  /** Drive angular frequency, rad/s. */
  driveOmega: number;
}

export const DEFAULT_SPRING: Readonly<SpringParams> = Object.freeze({
  m: 1,
  k: 4,
  c: 0.05,
  driveAmp: 0,
  driveOmega: 2,
});

export const SPRING_STATE = 2;

export type SpringState = Float64Array | Float32Array | number[];

/** Acceleration from Newton's second law. */
export function springAcceleration(x: number, v: number, t: number, params: SpringParams): number {
  const drive = params.driveAmp * Math.sin(params.driveOmega * t);
  return (drive - params.c * v - params.k * x) / params.m;
}

/** Writes [v, a] into `out`. `out` must not alias `state`. */
export function springDerivatives<T extends SpringState = Float64Array>(
  state: SpringState,
  params: SpringParams,
  t: number,
  out?: T,
): T {
  const result = (out ?? new Float64Array(SPRING_STATE)) as T;
  result[0] = state[1];
  result[1] = springAcceleration(state[0], state[1], t, params);
  return result;
}

/** Kinetic plus elastic energy, joules. The drive and the damper are not stored here. */
export function springEnergy(state: SpringState, params: SpringParams, out?: Energy): Energy {
  const energy = out ?? { kinetic: 0, potential: 0, total: 0 };
  energy.kinetic = 0.5 * params.m * state[1] * state[1];
  energy.potential = 0.5 * params.k * state[0] * state[0];
  energy.total = energy.kinetic + energy.potential;
  return energy;
}

const k1 = new Float64Array(SPRING_STATE);
const k2 = new Float64Array(SPRING_STATE);
const k3 = new Float64Array(SPRING_STATE);
const k4 = new Float64Array(SPRING_STATE);
const mid = new Float64Array(SPRING_STATE);

/** One classical RK4 step. `out` may alias `state`. Returns the time at the end of the step. */
export function springRk4(
  state: SpringState,
  params: SpringParams,
  t: number,
  dt: number = DEFAULT_DT,
  out?: SpringState,
): number {
  springDerivatives(state, params, t, k1);
  mid[0] = state[0] + (dt / 2) * k1[0];
  mid[1] = state[1] + (dt / 2) * k1[1];
  springDerivatives(mid, params, t + dt / 2, k2);
  mid[0] = state[0] + (dt / 2) * k2[0];
  mid[1] = state[1] + (dt / 2) * k2[1];
  springDerivatives(mid, params, t + dt / 2, k3);
  mid[0] = state[0] + dt * k3[0];
  mid[1] = state[1] + dt * k3[1];
  springDerivatives(mid, params, t + dt, k4);
  const target = out ?? state;
  target[0] = state[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  target[1] = state[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  return t + dt;
}

/** Samples [x, v] every `dt`, including the initial state. */
export function simulateSpring(
  initial: SpringState,
  params: SpringParams,
  steps: number,
  dt: number = DEFAULT_DT,
): Float32Array {
  const out = new Float32Array((steps + 1) * SPRING_STATE);
  const state = new Float64Array([initial[0], initial[1]]);
  out[0] = state[0];
  out[1] = state[1];
  let t = 0;
  for (let step = 1; step <= steps; step++) {
    t = springRk4(state, params, t, dt, state);
    out[step * 2] = state[0];
    out[step * 2 + 1] = state[1];
  }
  return out;
}

/** Closed form for c = 0 and no drive: x(t) = x0 cos ωt + (v0/ω) sin ωt. */
export function springAnalytic(x0: number, v0: number, t: number, params: SpringParams): [number, number] {
  const omega = Math.sqrt(params.k / params.m);
  const x = x0 * Math.cos(omega * t) + (v0 / omega) * Math.sin(omega * t);
  const v = -x0 * omega * Math.sin(omega * t) + v0 * Math.cos(omega * t);
  return [x, v];
}
