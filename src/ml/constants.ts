/** Model step. Labels are RK4 substeps of this interval, not the 1/240 s scene clock. */
export const MODEL_DT = 0.02;

/** RK4 substeps inside one model step. 0.02 / 4 = 0.005 s. */
export const SUBSTEPS = 4;

/** Three hidden layers, tanh. Small enough to train in the browser. */
export const HIDDEN_UNITS = [64, 64, 64] as const;

export const BATCH_SIZE = 64;
/** Cosine decay starts here and ends at LEARNING_RATE_END. */
export const LEARNING_RATE = 1e-3;
export const LEARNING_RATE_END = 1e-4;

/**
 * Optimizer steps for the live lab. Dataset size does not change this budget.
 * Sized so a 20% run stays under about 20 s on WebGL.
 */
export const LIVE_STEPS = 400;

/** Optimizer steps for a live re-run in the browser. Shorter than the headless script. */
export const EXPERIMENT_STEPS = 240;

/**
 * Optimizer steps for `pnpm experiments`, including the seed sweep.
 * Both models use this same budget. 1300 keeps the eight fits under four minutes:
 * a measured pair of steps was about 20 ms on this CPU, so 2000 steps would take about five.
 */
export const HEADLESS_STEPS = 1300;

/** Seeds for the E1 and E2 (5%) sweep. The reported table uses the first one. */
export const SWEEP_SEEDS = [2026, 7, 42] as const;

export const DEFAULT_LAMBDA = 0.4;
export const DEFAULT_FRACTION = 0.2;
export const SEED = 2026;

/**
 * Shared normalization so both models see the same targets.
 * Angles enter as sin/cos. Angular velocity is divided by `omega`.
 * The network predicts a state change divided by `dTheta` / `dOmega`.
 */
export const NORM = {
  omega: 8,
  dTheta: 0.2,
  dOmega: 1,
} as const;

/**
 * Scales for the physics residual, in rad/s and rad/s², so a large angular
 * acceleration does not drown the angle rows.
 */
export const DERIV_SCALE = [4, 4, 25, 25] as const;

/** Multiplier on the relative energy residual inside the physics loss. */
export const ENERGY_WEIGHT = 3;

export const COLLOCATION = 512;
export const ROLLOUT_SECONDS = 14;

export const DATA_FRACTIONS = [5, 10, 20, 50, 100] as const;

export const TRAIN_TRAJECTORIES = 8;
export const TEST_TRAJECTORIES = 4;
export const TRAIN_SECONDS = 3;
export const TEST_SECONDS = 10;
