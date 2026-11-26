import { DEFAULT_DT, type Energy } from "./types";

/**
 * Projectile in a vertical plane. State is [x, y, vx, vy], metres and m/s.
 * y points up and the ground is y = 0.
 *
 *   m a + c |v| v + m g ŷ = 0
 *
 * With c = 0 the total energy ½ m |v|² + m g y is conserved.
 */
export interface ProjectileParams {
  /** Mass, kg. */
  m: number;
  /** Gravity, m/s². Positive pulls toward −y. */
  g: number;
  /** Quadratic drag coefficient, kg/m. */
  c: number;
  /** Launch angle above the ground, degrees. */
  angle: number;
  /** Launch speed, m/s. */
  speed: number;
}

export const DEFAULT_PROJECTILE: Readonly<ProjectileParams> = Object.freeze({
  m: 1,
  g: 9.81,
  c: 0.12,
  angle: 55,
  speed: 14,
});

export const PROJECTILE_STATE = 4;

export type ProjectileState = Float64Array | Float32Array | number[];

export function projectileLaunch(params: ProjectileParams, out?: ProjectileState): ProjectileState {
  const result = out ?? new Float64Array(PROJECTILE_STATE);
  const rad = (params.angle * Math.PI) / 180;
  result[0] = 0;
  result[1] = 0;
  result[2] = params.speed * Math.cos(rad);
  result[3] = params.speed * Math.sin(rad);
  return result;
}

/** Acceleration from m a + c |v| v + m g ŷ = 0. */
export function projectileAcceleration(
  vx: number,
  vy: number,
  params: ProjectileParams,
): [number, number] {
  const speed = Math.hypot(vx, vy);
  const drag = (params.c * speed) / params.m;
  return [-drag * vx, -drag * vy - params.g];
}

/** Writes [vx, vy, ax, ay] into `out`. `out` must not alias `state`. */
export function projectileDerivatives<T extends ProjectileState = Float64Array>(
  state: ProjectileState,
  params: ProjectileParams,
  out?: T,
): T {
  const result = (out ?? new Float64Array(PROJECTILE_STATE)) as T;
  const [ax, ay] = projectileAcceleration(state[2], state[3], params);
  result[0] = state[2];
  result[1] = state[3];
  result[2] = ax;
  result[3] = ay;
  return result;
}

/** Kinetic plus gravitational energy. Drag is not stored here. */
export function projectileEnergy(state: ProjectileState, params: ProjectileParams, out?: Energy): Energy {
  const energy = out ?? { kinetic: 0, potential: 0, total: 0 };
  const speed2 = state[2] * state[2] + state[3] * state[3];
  energy.kinetic = 0.5 * params.m * speed2;
  energy.potential = params.m * params.g * state[1];
  energy.total = energy.kinetic + energy.potential;
  return energy;
}

const k1 = new Float64Array(PROJECTILE_STATE);
const k2 = new Float64Array(PROJECTILE_STATE);
const k3 = new Float64Array(PROJECTILE_STATE);
const k4 = new Float64Array(PROJECTILE_STATE);
const mid = new Float64Array(PROJECTILE_STATE);

/** One classical RK4 step. `out` may alias `state`. */
export function projectileRk4(
  state: ProjectileState,
  params: ProjectileParams,
  dt: number = DEFAULT_DT,
  out?: ProjectileState,
): void {
  projectileDerivatives(state, params, k1);
  for (let i = 0; i < 4; i++) mid[i] = state[i] + (dt / 2) * k1[i];
  projectileDerivatives(mid, params, k2);
  for (let i = 0; i < 4; i++) mid[i] = state[i] + (dt / 2) * k2[i];
  projectileDerivatives(mid, params, k3);
  for (let i = 0; i < 4; i++) mid[i] = state[i] + dt * k3[i];
  projectileDerivatives(mid, params, k4);
  const target = out ?? state;
  for (let i = 0; i < 4; i++) {
    target[i] = state[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
}

/** Samples the state every `dt`, including the initial state. */
export function simulateProjectile(
  initial: ProjectileState,
  params: ProjectileParams,
  steps: number,
  dt: number = DEFAULT_DT,
): Float32Array {
  const out = new Float32Array((steps + 1) * PROJECTILE_STATE);
  const state = new Float64Array([initial[0], initial[1], initial[2], initial[3]]);
  out.set(state, 0);
  for (let step = 1; step <= steps; step++) {
    projectileRk4(state, params, dt, state);
    out.set(state, step * PROJECTILE_STATE);
  }
  return out;
}

/** Closed form for c = 0. y grows up. */
export function projectileAnalytic(
  initial: ProjectileState,
  t: number,
  params: ProjectileParams,
): [number, number, number, number] {
  const x = initial[0] + initial[2] * t;
  const y = initial[1] + initial[3] * t - 0.5 * params.g * t * t;
  const vx = initial[2];
  const vy = initial[3] - params.g * t;
  return [x, y, vx, vy];
}

/** First return to the ground while falling, or null if it stays aloft. */
export function projectileLanding(
  trajectory: ArrayLike<number>,
  dt: number,
): { x: number; time: number } | null {
  const samples = trajectory.length / PROJECTILE_STATE;
  for (let i = 1; i < samples; i++) {
    const y0 = trajectory[(i - 1) * 4 + 1];
    const y1 = trajectory[i * 4 + 1];
    const vy1 = trajectory[i * 4 + 3];
    if (y0 > 0 && y1 <= 0 && vy1 <= 0) {
      const span = y0 - y1;
      const fraction = span === 0 ? 0 : y0 / span;
      const x0 = trajectory[(i - 1) * 4];
      const x1 = trajectory[i * 4];
      return { x: x0 + (x1 - x0) * fraction, time: (i - 1 + fraction) * dt };
    }
  }
  return null;
}
