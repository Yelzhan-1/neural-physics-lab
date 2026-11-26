/**
 * State of the double pendulum, laid out as [theta1, theta2, omega1, omega2].
 *
 * Angles are absolute, measured from the downward vertical, in radians.
 * Angular velocities are in rad/s.
 */
export type PendulumState = Float64Array | Float32Array | number[];

export const STATE_SIZE = 4;

export interface PendulumParams {
  /** Mass of the first bob, kg. */
  m1: number;
  /** Mass of the second bob, kg. */
  m2: number;
  /** Length of the first link, m. */
  l1: number;
  /** Length of the second link, m. */
  l2: number;
  /** Gravitational acceleration, m/s^2. */
  g: number;
  /**
   * Viscous damping coefficient, N·m·s/rad, applied as the generalised
   * force -damping * omega_i on each angle. 0 means a conservative system.
   */
  damping: number;
}

export const DEFAULT_PARAMS: Readonly<PendulumParams> = Object.freeze({
  m1: 1,
  m2: 1,
  l1: 1,
  l2: 1,
  g: 9.81,
  damping: 0,
});

/** Fixed integration step, seconds. */
export const DEFAULT_DT = 1 / 240;

export interface Energy {
  kinetic: number;
  potential: number;
  total: number;
}

/**
 * Cartesian kinematics of both bobs. The pivot is the origin, x points right
 * and y points up, so a pendulum at rest has y1 = -l1.
 */
export interface Kinematics {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  vx1: number;
  vy1: number;
  vx2: number;
  vy2: number;
  ax1: number;
  ay1: number;
  ax2: number;
  ay2: number;
  /** Angular accelerations, rad/s^2. */
  alpha1: number;
  alpha2: number;
}

export function createKinematics(): Kinematics {
  return {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    vx1: 0,
    vy1: 0,
    vx2: 0,
    vy2: 0,
    ax1: 0,
    ay1: 0,
    ax2: 0,
    ay2: 0,
    alpha1: 0,
    alpha2: 0,
  };
}

/**
 * A sampled trajectory: `states` holds `STATE_SIZE` numbers per sample,
 * `dt` seconds apart, starting at t = 0. This is the exchange format between
 * the engine, the renderer and (in Step B) the neural models.
 */
export interface Trajectory {
  states: Float32Array;
  dt: number;
}
