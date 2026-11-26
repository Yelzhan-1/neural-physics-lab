import {
  createKinematics,
  DEFAULT_DT,
  DEFAULT_PARAMS,
  energy,
  kinematics,
  rk4Step,
  STATE_SIZE,
  type Energy,
  type Kinematics,
  type PendulumParams,
  type Trajectory,
} from "@/engine";

export type SlotId = "physics" | "nn" | "pinn";

export interface SlotDefinition {
  id: SlotId;
  label: string;
  /** Solid colour of links, bobs and the trail core. */
  color: string;
  /** Same hue as `color`, as "r, g, b" for building translucent fills. */
  rgb: string;
}

export const SLOTS: readonly SlotDefinition[] = [
  { id: "physics", label: "Physics (RK4)", color: "#22d3ee", rgb: "34, 211, 238" },
  { id: "nn", label: "Standard NN", color: "#fb923c", rgb: "251, 146, 60" },
  { id: "pinn", label: "PINN", color: "#a78bfa", rgb: "167, 139, 250" },
];

export const SLOT_COUNT = SLOTS.length;
export const PHYSICS_SLOT = 0;

/** Trail samples are taken every this many integration steps. */
const TRAIL_STRIDE = 2;
/** Energy samples are taken every this many integration steps. */
export const HISTORY_STRIDE = 4;
/** Upper bound on integration steps per frame, so a stalled tab cannot spiral. */
const MAX_STEPS_PER_FRAME = 480;

/** Ring buffer of the second bob's path in world coordinates (metres). */
export class Trail {
  readonly capacity: number;
  readonly points: Float32Array;
  /** Index the next sample is written to. */
  head = 0;
  length = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.points = new Float32Array(capacity * 2);
  }

  push(x: number, y: number): void {
    this.points[this.head * 2] = x;
    this.points[this.head * 2 + 1] = y;
    this.head = (this.head + 1) % this.capacity;
    if (this.length < this.capacity) this.length++;
  }

  clear(): void {
    this.head = 0;
    this.length = 0;
  }
}

/** Ring buffer of (time, physics energy, NN energy, PINN energy). NaN means inactive. */
export class ComparisonHistory {
  static readonly STRIDE = 4;
  readonly capacity: number;
  readonly samples: Float32Array;
  head = 0;
  length = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.samples = new Float32Array(capacity * ComparisonHistory.STRIDE);
  }

  push(time: number, physics: number, nn: number, pinn: number): void {
    const offset = this.head * ComparisonHistory.STRIDE;
    this.samples[offset] = time;
    this.samples[offset + 1] = physics;
    this.samples[offset + 2] = nn;
    this.samples[offset + 3] = pinn;
    this.head = (this.head + 1) % this.capacity;
    if (this.length < this.capacity) this.length++;
  }

  clear(): void {
    this.head = 0;
    this.length = 0;
  }
}

/** Ring buffer of (time, kinetic, potential, total) samples. */
export class EnergyHistory {
  static readonly STRIDE = 4;
  readonly capacity: number;
  readonly samples: Float32Array;
  head = 0;
  length = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.samples = new Float32Array(capacity * EnergyHistory.STRIDE);
  }

  push(time: number, value: Energy): void {
    const offset = this.head * EnergyHistory.STRIDE;
    this.samples[offset] = time;
    this.samples[offset + 1] = value.kinetic;
    this.samples[offset + 2] = value.potential;
    this.samples[offset + 3] = value.total;
    this.head = (this.head + 1) % this.capacity;
    if (this.length < this.capacity) this.length++;
  }

  clear(): void {
    this.head = 0;
    this.length = 0;
  }
}

export interface RuntimeOptions {
  /** Number of trail samples kept per slot. */
  trailLength?: number;
  dt?: number;
}

type FrameListener = () => void;

/**
 * Owns the simulation clock and everything the views read each frame.
 *
 * The physics slot is integrated live. Every other slot replays a
 * `Trajectory` against the same clock, which is how Step B plugs model
 * predictions in: call `setTrajectory("nn", { states, dt })`.
 *
 * All per-frame work writes into buffers allocated here, so `tick` and the
 * views that read it do not allocate.
 */
export class LabRuntime {
  readonly dt: number;
  readonly params: PendulumParams = { ...DEFAULT_PARAMS };
  /** Initial [theta1, theta2, omega1, omega2] the run restarts from. */
  readonly initial = new Float64Array(STATE_SIZE);
  /** Current state of each slot, indexed like `SLOTS`. */
  readonly states: Float64Array[];
  /** Whether a slot has something to draw. Physics is always active. */
  readonly active: boolean[];
  readonly trails: Trail[];
  readonly trajectories: (Trajectory | null)[];

  /** Kinematics and energy of the physics slot, refreshed every tick. */
  readonly kinematics: Kinematics = createKinematics();
  readonly energy: Energy = { kinetic: 0, potential: 0, total: 0 };
  readonly history = new EnergyHistory(720);
  /** Total energy of the three slots, sampled on the same clock as `history`. */
  readonly comparison = new ComparisonHistory(720);
  private readonly slotEnergy: Energy = { kinetic: 0, potential: 0, total: 0 };
  initialEnergy = 0;
  /** Largest |E - E0| seen since the last reset, joules. */
  maxEnergyError = 0;

  time = 0;
  playing = true;
  speed = 1;
  /** True while the user holds a bob; the clock is frozen meanwhile. */
  dragging = false;
  /** Bumped on every reset so views can restart their own animations. */
  epoch = 0;

  private accumulator = 0;
  private stepCount = 0;
  private readonly listeners: FrameListener[] = [];

  constructor(options: RuntimeOptions = {}) {
    this.dt = options.dt ?? DEFAULT_DT;
    const trailLength = options.trailLength ?? 600;
    this.states = SLOTS.map(() => new Float64Array(STATE_SIZE));
    this.active = SLOTS.map((_, index) => index === PHYSICS_SLOT);
    this.trails = SLOTS.map(() => new Trail(trailLength));
    this.trajectories = SLOTS.map(() => null);
    this.reset();
  }

  /** Replaces the parameters and restarts from the initial state. */
  setParams(next: PendulumParams): void {
    Object.assign(this.params, next);
    this.reset();
  }

  /** Sets the release angles (radians), zero initial velocity, and restarts. */
  setInitialAngles(theta1: number, theta2: number): void {
    this.initial[0] = theta1;
    this.initial[1] = theta2;
    this.initial[2] = 0;
    this.initial[3] = 0;
    this.reset();
  }

  /**
   * Supplies or clears the predicted trajectory of a slot. The trajectory is
   * expected to start from the current initial state at t = 0.
   */
  setTrajectory(id: Exclude<SlotId, "physics">, trajectory: Trajectory | null): void {
    const index = SLOTS.findIndex((slot) => slot.id === id);
    this.trajectories[index] = trajectory;
    this.active[index] = trajectory !== null && trajectory.states.length >= STATE_SIZE;
    this.reset();
  }

  /** Replaces several predicted trajectories, then restarts the clock once. */
  setTrajectories(
    next: Partial<Record<Exclude<SlotId, "physics">, Trajectory | null>>,
  ): void {
    for (const id of ["nn", "pinn"] as const) {
      if (!(id in next)) continue;
      const index = SLOTS.findIndex((slot) => slot.id === id);
      const trajectory = next[id] ?? null;
      this.trajectories[index] = trajectory;
      this.active[index] = trajectory !== null && trajectory.states.length >= STATE_SIZE;
    }
    this.reset();
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /** Freezes the clock while the user holds a bob. */
  setDragging(dragging: boolean): void {
    this.dragging = dragging;
  }

  reset(): void {
    this.time = 0;
    this.accumulator = 0;
    this.stepCount = 0;
    this.states[PHYSICS_SLOT].set(this.initial);
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      this.trails[slot].clear();
      if (slot !== PHYSICS_SLOT) this.sampleTrajectory(slot);
    }
    this.history.clear();
    this.comparison.clear();
    this.refreshDerived();
    this.initialEnergy = this.energy.total;
    this.maxEnergyError = 0;
    this.history.push(0, this.energy);
    this.recordComparison();
    this.epoch++;
  }

  /** Advances the clock by `elapsed` wall-clock seconds and notifies views. */
  tick(elapsed: number): void {
    if (this.playing && !this.dragging) {
      this.accumulator += elapsed * this.speed;
      let steps = Math.floor(this.accumulator / this.dt);
      if (steps > MAX_STEPS_PER_FRAME) {
        steps = MAX_STEPS_PER_FRAME;
        this.accumulator = 0;
      } else {
        this.accumulator -= steps * this.dt;
      }
      const physics = this.states[PHYSICS_SLOT];
      for (let i = 0; i < steps; i++) {
        rk4Step(physics, this.params, this.dt, physics);
        this.stepCount++;
        this.time = this.stepCount * this.dt;
        if (this.stepCount % TRAIL_STRIDE === 0) this.recordTrails();
        if (this.stepCount % HISTORY_STRIDE === 0) {
          energy(physics, this.params, this.energy);
          const error = Math.abs(this.energy.total - this.initialEnergy);
          if (error > this.maxEnergyError) this.maxEnergyError = error;
          this.history.push(this.time, this.energy);
          this.recordComparison();
        }
      }
      if (steps > 0) this.refreshDerived();
    }
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i]();
  }

  /** Registers a callback run after every tick. Returns an unsubscribe. */
  onFrame(listener: FrameListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  private recordComparison(): void {
    const nn = this.active[1] ? energy(this.states[1], this.params, this.slotEnergy).total : Number.NaN;
    const pinn = this.active[2]
      ? energy(this.states[2], this.params, this.slotEnergy).total
      : Number.NaN;
    this.comparison.push(this.time, this.energy.total, nn, pinn);
  }

  private refreshDerived(): void {
    kinematics(this.states[PHYSICS_SLOT], this.params, this.kinematics);
    energy(this.states[PHYSICS_SLOT], this.params, this.energy);
  }

  private recordTrails(): void {
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      if (slot !== PHYSICS_SLOT) this.sampleTrajectory(slot);
      if (!this.active[slot]) continue;
      const state = this.states[slot];
      const { l1, l2 } = this.params;
      const x = l1 * Math.sin(state[0]) + l2 * Math.sin(state[1]);
      const y = -l1 * Math.cos(state[0]) - l2 * Math.cos(state[1]);
      this.trails[slot].push(x, y);
    }
  }

  /**
   * Writes the slot's state at the current time by linear interpolation of
   * its trajectory. Past the last sample the final state is held.
   */
  private sampleTrajectory(slot: number): void {
    const trajectory = this.trajectories[slot];
    const state = this.states[slot];
    if (!trajectory || !this.active[slot]) {
      state.set(this.initial);
      return;
    }
    const samples = trajectory.states;
    const last = samples.length / STATE_SIZE - 1;
    const position = Math.min(this.time / trajectory.dt, last);
    const index = Math.min(Math.floor(position), Math.max(last - 1, 0));
    const fraction = last === 0 ? 0 : position - index;
    const a = index * STATE_SIZE;
    const b = Math.min(index + 1, last) * STATE_SIZE;
    for (let i = 0; i < STATE_SIZE; i++) {
      state[i] = samples[a + i] + (samples[b + i] - samples[a + i]) * fraction;
    }
  }
}
