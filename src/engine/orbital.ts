import { DEFAULT_DT, type Energy } from "./types";

/**
 * Planar motion in a fixed central potential. State is [x, y, vx, vy].
 *
 *   a = −GM r / |r|³
 *
 * Specific energy ½ |v|² − GM/|r| and specific angular momentum x vy − y vx
 * are conserved.
 */
export interface OrbitalParams {
  /** Gravitational parameter GM, m³/s². */
  gm: number;
  /** Initial orbital radius, m. */
  radius: number;
  /** Initial tangential speed, m/s. Circular when this equals sqrt(GM / radius). */
  speed: number;
}

export const DEFAULT_ORBITAL: Readonly<OrbitalParams> = Object.freeze({
  gm: 1,
  radius: 1,
  speed: 1,
});

export const ORBITAL_STATE = 4;

export type OrbitalState = Float64Array | Float32Array | number[];

export function orbitalLaunch(params: OrbitalParams, out?: OrbitalState): OrbitalState {
  const result = out ?? new Float64Array(ORBITAL_STATE);
  result[0] = params.radius;
  result[1] = 0;
  result[2] = 0;
  result[3] = params.speed;
  return result;
}

export function circularSpeed(params: Pick<OrbitalParams, "gm" | "radius">): number {
  return Math.sqrt(params.gm / params.radius);
}

/** Acceleration a = −GM r / |r|³. */
export function orbitalAcceleration(x: number, y: number, gm: number): [number, number] {
  const radius2 = x * x + y * y;
  const radius = Math.sqrt(radius2);
  const scale = gm / (radius2 * radius);
  return [-x * scale, -y * scale];
}

/** Writes [vx, vy, ax, ay] into `out`. `out` must not alias `state`. */
export function orbitalDerivatives<T extends OrbitalState = Float64Array>(
  state: OrbitalState,
  params: OrbitalParams,
  out?: T,
): T {
  const result = (out ?? new Float64Array(ORBITAL_STATE)) as T;
  const [ax, ay] = orbitalAcceleration(state[0], state[1], params.gm);
  result[0] = state[2];
  result[1] = state[3];
  result[2] = ax;
  result[3] = ay;
  return result;
}

/** Specific mechanical energy. The mass is 1, so this is energy per unit mass. */
export function orbitalEnergy(state: OrbitalState, params: OrbitalParams, out?: Energy): Energy {
  const energy = out ?? { kinetic: 0, potential: 0, total: 0 };
  const radius = Math.hypot(state[0], state[1]);
  energy.kinetic = 0.5 * (state[2] * state[2] + state[3] * state[3]);
  energy.potential = -params.gm / radius;
  energy.total = energy.kinetic + energy.potential;
  return energy;
}

/** Specific angular momentum x vy − y vx. */
export function angularMomentum(state: OrbitalState): number {
  return state[0] * state[3] - state[1] * state[2];
}

const k1 = new Float64Array(ORBITAL_STATE);
const k2 = new Float64Array(ORBITAL_STATE);
const k3 = new Float64Array(ORBITAL_STATE);
const k4 = new Float64Array(ORBITAL_STATE);
const mid = new Float64Array(ORBITAL_STATE);

/** One classical RK4 step. `out` may alias `state`. */
export function orbitalRk4(
  state: OrbitalState,
  params: OrbitalParams,
  dt: number = DEFAULT_DT,
  out?: OrbitalState,
): void {
  orbitalDerivatives(state, params, k1);
  for (let i = 0; i < 4; i++) mid[i] = state[i] + (dt / 2) * k1[i];
  orbitalDerivatives(mid, params, k2);
  for (let i = 0; i < 4; i++) mid[i] = state[i] + (dt / 2) * k2[i];
  orbitalDerivatives(mid, params, k3);
  for (let i = 0; i < 4; i++) mid[i] = state[i] + dt * k3[i];
  orbitalDerivatives(mid, params, k4);
  const target = out ?? state;
  for (let i = 0; i < 4; i++) {
    target[i] = state[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
}

/** Samples the state every `dt`, including the initial state. */
export function simulateOrbital(
  initial: OrbitalState,
  params: OrbitalParams,
  steps: number,
  dt: number = DEFAULT_DT,
): Float32Array {
  const out = new Float32Array((steps + 1) * ORBITAL_STATE);
  const state = new Float64Array([initial[0], initial[1], initial[2], initial[3]]);
  out.set(state, 0);
  for (let step = 1; step <= steps; step++) {
    orbitalRk4(state, params, dt, state);
    out.set(state, step * ORBITAL_STATE);
  }
  return out;
}

/**
 * Circular orbit x = r cos ωt, y = r sin ωt, ω = sqrt(GM / r³),
 * released from (r, 0) with velocity (0, ω r).
 */
export function orbitalAnalytic(t: number, params: OrbitalParams): [number, number, number, number] {
  const radius = params.radius;
  const omega = Math.sqrt(params.gm / (radius * radius * radius));
  const angle = omega * t;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [radius * cos, radius * sin, -radius * omega * sin, radius * omega * cos];
}
