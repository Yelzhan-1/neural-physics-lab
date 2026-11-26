import {
  createKinematics,
  DEFAULT_DT,
  STATE_SIZE,
  type Energy,
  type Kinematics,
  type PendulumParams,
  type PendulumState,
} from "./types";

/*
 * Double pendulum, derived from the Lagrangian L = T - V with absolute angles
 * theta1, theta2 measured from the downward vertical.
 *
 *   T = 1/2 (m1 + m2) l1^2 w1^2 + 1/2 m2 l2^2 w2^2
 *       + m2 l1 l2 w1 w2 cos(theta1 - theta2)
 *   V = -(m1 + m2) g l1 cos(theta1) - m2 g l2 cos(theta2)
 *
 * The Euler-Lagrange equations give M(theta) * alpha = f(theta, omega):
 *
 *   M11 = (m1 + m2) l1^2        M12 = M21 = m2 l1 l2 cos(d)
 *   M22 = m2 l2^2               d = theta1 - theta2
 *
 *   f1 = -m2 l1 l2 w2^2 sin(d) - (m1 + m2) g l1 sin(theta1) - c w1
 *   f2 =  m2 l1 l2 w1^2 sin(d) -        m2 g l2 sin(theta2) - c w2
 *
 * det(M) = m2 l1^2 l2^2 (m1 + m2 sin^2(d)) > 0 for positive masses and
 * lengths, so the 2x2 solve below is always well defined.
 */

/**
 * Time derivative of the state: [omega1, omega2, alpha1, alpha2].
 * Writes into `out` and returns it; `out` may not alias `state`.
 */
export function derivatives<T extends PendulumState = Float64Array>(
  state: PendulumState,
  params: PendulumParams,
  out?: T,
): T {
  const result = (out ?? new Float64Array(STATE_SIZE)) as T;
  const theta1 = state[0];
  const theta2 = state[1];
  const omega1 = state[2];
  const omega2 = state[3];
  const { m1, m2, l1, l2, g, damping } = params;

  const delta = theta1 - theta2;
  const sinD = Math.sin(delta);
  const cosD = Math.cos(delta);
  const mTotal = m1 + m2;

  const m11 = mTotal * l1 * l1;
  const m12 = m2 * l1 * l2 * cosD;
  const m22 = m2 * l2 * l2;

  const coupling = m2 * l1 * l2 * sinD;
  const f1 =
    -coupling * omega2 * omega2 -
    mTotal * g * l1 * Math.sin(theta1) -
    damping * omega1;
  const f2 =
    coupling * omega1 * omega1 -
    m2 * g * l2 * Math.sin(theta2) -
    damping * omega2;

  const det = m11 * m22 - m12 * m12;

  result[0] = omega1;
  result[1] = omega2;
  result[2] = (m22 * f1 - m12 * f2) / det;
  result[3] = (m11 * f2 - m12 * f1) / det;
  return result;
}

// Scratch buffers for rk4Step. The engine is single-threaded and rk4Step does
// not re-enter, so sharing them keeps the hot path allocation-free.
const k1 = new Float64Array(STATE_SIZE);
const k2 = new Float64Array(STATE_SIZE);
const k3 = new Float64Array(STATE_SIZE);
const k4 = new Float64Array(STATE_SIZE);
const stage = new Float64Array(STATE_SIZE);

/**
 * One classical fourth-order Runge-Kutta step of size `dt`.
 * Writes into `out` and returns it; `out` may alias `state` to step in place.
 */
export function rk4Step<T extends PendulumState = Float64Array>(
  state: PendulumState,
  params: PendulumParams,
  dt: number = DEFAULT_DT,
  out?: T,
): T {
  const result = (out ?? new Float64Array(STATE_SIZE)) as T;
  const half = dt * 0.5;

  derivatives(state, params, k1);
  for (let i = 0; i < STATE_SIZE; i++) stage[i] = state[i] + half * k1[i];
  derivatives(stage, params, k2);
  for (let i = 0; i < STATE_SIZE; i++) stage[i] = state[i] + half * k2[i];
  derivatives(stage, params, k3);
  for (let i = 0; i < STATE_SIZE; i++) stage[i] = state[i] + dt * k3[i];
  derivatives(stage, params, k4);

  const sixth = dt / 6;
  for (let i = 0; i < STATE_SIZE; i++) {
    result[i] = state[i] + sixth * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  return result;
}

/**
 * Integrates `steps` RK4 steps and returns every state, including the initial
 * one, as a flat Float32Array of length (steps + 1) * STATE_SIZE.
 *
 * Integration runs in double precision; only the stored samples are rounded
 * to single precision.
 */
export function simulate(
  initialState: PendulumState,
  params: PendulumParams,
  steps: number,
  dt: number = DEFAULT_DT,
): Float32Array {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new RangeError("steps must be a non-negative integer");
  }
  const trajectory = new Float32Array((steps + 1) * STATE_SIZE);
  const current = new Float64Array(STATE_SIZE);
  for (let i = 0; i < STATE_SIZE; i++) current[i] = initialState[i];
  trajectory.set(current, 0);

  for (let step = 1; step <= steps; step++) {
    rk4Step(current, params, dt, current);
    trajectory.set(current, step * STATE_SIZE);
  }
  return trajectory;
}

/**
 * Mechanical energy in joules. Potential energy is measured from the stable
 * equilibrium (both links hanging straight down), so it is never negative.
 * Pass `out` to avoid allocating.
 */
export function energy(
  state: PendulumState,
  params: PendulumParams,
  out?: Energy,
): Energy {
  const result = out ?? { kinetic: 0, potential: 0, total: 0 };
  const theta1 = state[0];
  const theta2 = state[1];
  const omega1 = state[2];
  const omega2 = state[3];
  const { m1, m2, l1, l2, g } = params;

  const kinetic =
    0.5 * (m1 + m2) * l1 * l1 * omega1 * omega1 +
    0.5 * m2 * l2 * l2 * omega2 * omega2 +
    m2 * l1 * l2 * omega1 * omega2 * Math.cos(theta1 - theta2);
  const potential =
    (m1 + m2) * g * l1 * (1 - Math.cos(theta1)) +
    m2 * g * l2 * (1 - Math.cos(theta2));

  result.kinetic = kinetic;
  result.potential = potential;
  result.total = kinetic + potential;
  return result;
}

const kinematicsScratch = new Float64Array(STATE_SIZE);

/**
 * Positions, velocities and accelerations of both bobs, plus the angular
 * accelerations. Pass `out` to avoid allocating.
 */
export function kinematics(
  state: PendulumState,
  params: PendulumParams,
  out?: Kinematics,
): Kinematics {
  const result = out ?? createKinematics();
  const theta1 = state[0];
  const theta2 = state[1];
  const omega1 = state[2];
  const omega2 = state[3];
  const { l1, l2 } = params;

  derivatives(state, params, kinematicsScratch);
  const alpha1 = kinematicsScratch[2];
  const alpha2 = kinematicsScratch[3];

  const s1 = Math.sin(theta1);
  const c1 = Math.cos(theta1);
  const s2 = Math.sin(theta2);
  const c2 = Math.cos(theta2);

  result.x1 = l1 * s1;
  result.y1 = -l1 * c1;
  result.x2 = result.x1 + l2 * s2;
  result.y2 = result.y1 - l2 * c2;

  result.vx1 = l1 * omega1 * c1;
  result.vy1 = l1 * omega1 * s1;
  result.vx2 = result.vx1 + l2 * omega2 * c2;
  result.vy2 = result.vy1 + l2 * omega2 * s2;

  result.ax1 = l1 * (alpha1 * c1 - omega1 * omega1 * s1);
  result.ay1 = l1 * (alpha1 * s1 + omega1 * omega1 * c1);
  result.ax2 = result.ax1 + l2 * (alpha2 * c2 - omega2 * omega2 * s2);
  result.ay2 = result.ay1 + l2 * (alpha2 * s2 + omega2 * omega2 * c2);

  result.alpha1 = alpha1;
  result.alpha2 = alpha2;
  return result;
}

export interface NormalMode {
  /** Angular frequency, rad/s. */
  omega: number;
  /** Amplitude ratio theta2 / theta1 of the mode shape. */
  ratio: number;
}

/**
 * Normal modes of the undamped system linearised about the stable
 * equilibrium, slow mode first. They solve det(K - w^2 M0) = 0 with
 *
 *   M0 = [[(m1 + m2) l1^2, m2 l1 l2], [m2 l1 l2, m2 l2^2]]
 *   K  = diag((m1 + m2) g l1, m2 g l2)
 */
export function normalModes(params: PendulumParams): [NormalMode, NormalMode] {
  const { m1, m2, l1, l2, g } = params;
  const mTotal = m1 + m2;

  // m1 l1 l2 w^4 - (m1 + m2) g (l1 + l2) w^2 + (m1 + m2) g^2 = 0
  const a = m1 * l1 * l2;
  const b = -mTotal * g * (l1 + l2);
  const c = mTotal * g * g;
  const root = Math.sqrt(b * b - 4 * a * c);
  const slowSquared = (-b - root) / (2 * a);
  const fastSquared = (-b + root) / (2 * a);

  // First row of (K - w^2 M0) v = 0 gives theta2 / theta1.
  const ratioFor = (omegaSquared: number) =>
    (mTotal * (g - omegaSquared * l1)) / (m2 * l2 * omegaSquared);

  return [
    { omega: Math.sqrt(slowSquared), ratio: ratioFor(slowSquared) },
    { omega: Math.sqrt(fastSquared), ratio: ratioFor(fastSquared) },
  ];
}
