import { DEFAULT_DT } from "@/engine";

const LANES = 3;

export type StepFn = (state: Float64Array, dt: number) => void;

/** Three planar slots. Physics is integrated; the other two replay a trajectory. */
export class MotionRuntime {
  time = 0;
  playing = true;
  speed = 1;
  readonly release = new Float64Array(4);
  readonly states: Float64Array[];
  readonly active: boolean[];
  readonly trajectories: (Float32Array | null)[];
  trajectoryDt = 0.02;
  /** When set, a body that falls through y = 0 stays on the ground. */
  ground = false;
  private stepFn: StepFn = () => {};
  private landed = [false, false, false];
  private readonly trails: number[][];
  private stepCount = 0;
  private accumulator = 0;
  private readonly listeners: Array<() => void> = [];

  constructor() {
    this.states = Array.from({ length: LANES }, () => new Float64Array(4));
    this.active = [true, false, false];
    this.trajectories = [null, null, null];
    this.trails = Array.from({ length: LANES }, () => []);
    this.reset();
  }

  setStep(step: StepFn): void {
    this.stepFn = step;
  }

  setGround(ground: boolean): void {
    this.ground = ground;
  }

  setRelease(next: ArrayLike<number>): void {
    this.release.set(next);
    this.reset();
  }

  setTrajectories(nn: Float32Array | null, pinn: Float32Array | null, dt: number): void {
    this.trajectories[1] = nn;
    this.trajectories[2] = pinn;
    this.trajectoryDt = dt;
    this.active[1] = nn !== null && nn.length >= 8;
    this.active[2] = pinn !== null && pinn.length >= 8;
    this.reset();
  }

  clearTrajectories(): void {
    this.setTrajectories(null, null, this.trajectoryDt);
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  reset(): void {
    this.time = 0;
    this.stepCount = 0;
    this.accumulator = 0;
    this.landed = [false, false, false];
    for (let slot = 0; slot < LANES; slot++) {
      this.states[slot].set(this.release);
      this.trails[slot] = [this.release[0], this.release[1]];
    }
    this.sample(1);
    this.sample(2);
  }

  tick(elapsed: number): void {
    if (this.playing && !this.landed[0]) {
      this.accumulator += Math.min(elapsed, 0.05) * this.speed;
      let steps = Math.floor(this.accumulator / DEFAULT_DT);
      if (steps > 480) {
        steps = 480;
        this.accumulator = 0;
      } else {
        this.accumulator -= steps * DEFAULT_DT;
      }
      const physics = this.states[0];
      for (let i = 0; i < steps; i++) {
        this.stepFn(physics, DEFAULT_DT);
        this.stepCount++;
        this.time = this.stepCount * DEFAULT_DT;
        if (this.ground && physics[1] <= 0 && physics[3] <= 0) {
          physics[1] = 0;
          physics[2] = 0;
          physics[3] = 0;
          this.landed[0] = true;
          break;
        }
      }
      if (steps > 0) this.pushTrail(0);
    }
    if (this.playing) {
      this.sample(1);
      this.sample(2);
    }
    for (const listener of this.listeners) listener();
  }

  onFrame(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  trail(slot: number): number[] {
    return this.trails[slot];
  }

  private pushTrail(slot: number): void {
    const trail = this.trails[slot];
    const state = this.states[slot];
    trail.push(state[0], state[1]);
    if (trail.length > 800) trail.splice(0, trail.length - 800);
  }

  private sample(slot: number): void {
    const trajectory = this.trajectories[slot];
    const state = this.states[slot];
    if (!trajectory || !this.active[slot]) {
      state.set(this.release);
      return;
    }
    const last = trajectory.length / 4 - 1;
    const position = Math.min(this.time / this.trajectoryDt, last);
    const index = Math.min(Math.floor(position), Math.max(last - 1, 0));
    const fraction = last === 0 ? 0 : position - index;
    for (let d = 0; d < 4; d++) {
      const a = trajectory[index * 4 + d];
      const b = trajectory[Math.min(index + 1, last) * 4 + d];
      state[d] = a + (b - a) * fraction;
    }
    let end = position;
    if (this.ground) {
      const crossed = landingIndex(trajectory);
      if (crossed !== null && position >= crossed) {
        state[0] = landingX(trajectory, crossed);
        state[1] = 0;
        state[2] = 0;
        state[3] = 0;
        this.landed[slot] = true;
        end = crossed;
      }
    }
    const trail: number[] = [];
    const lastPoint = Math.max(0, Math.floor(end));
    for (let i = 0; i <= lastPoint; i++) trail.push(trajectory[i * 4], trajectory[i * 4 + 1]);
    trail.push(state[0], state[1]);
    this.trails[slot] = trail;
  }
}

function landingIndex(trajectory: Float32Array): number | null {
  const samples = trajectory.length / 4;
  for (let i = 1; i < samples; i++) {
    const y0 = trajectory[(i - 1) * 4 + 1];
    const y1 = trajectory[i * 4 + 1];
    if (y0 > 0 && y1 <= 0) return i - 1 + (y1 === y0 ? 0 : y0 / (y0 - y1));
  }
  return null;
}

function landingX(trajectory: Float32Array, position: number): number {
  const i = Math.floor(position);
  const fraction = position - i;
  const x0 = trajectory[i * 4];
  const x1 = trajectory[Math.min(i + 1, trajectory.length / 4 - 1) * 4];
  return x0 + (x1 - x0) * fraction;
}
