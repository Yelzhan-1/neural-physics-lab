import { DEFAULT_DT, DEFAULT_SPRING, springEnergy, springRk4, type SpringParams } from "@/engine";
import type { Trajectory } from "@/engine";

const LANES = 3;

/** Three spring-mass slots sharing one clock. Physics is integrated; the others replay. */
export class SpringRuntime {
  time = 0;
  playing = true;
  speed = 1;
  params: SpringParams = { ...DEFAULT_SPRING };
  readonly release = new Float64Array([0.65, 0]);
  readonly states: Float64Array[];
  readonly active: boolean[];
  readonly trajectories: (Trajectory | null)[];
  private stepCount = 0;
  private accumulator = 0;
  private readonly listeners: Array<() => void> = [];

  constructor() {
    this.states = Array.from({ length: LANES }, () => new Float64Array(2));
    this.active = [true, false, false];
    this.trajectories = [null, null, null];
    this.reset();
  }

  setParams(next: SpringParams): void {
    this.params = { ...next };
    this.reset();
  }

  setRelease(x: number): void {
    this.release[0] = x;
    this.release[1] = 0;
    this.reset();
  }

  setTrajectories(nn: Trajectory | null, pinn: Trajectory | null): void {
    this.trajectories[1] = nn;
    this.trajectories[2] = pinn;
    this.active[1] = nn !== null && nn.states.length >= 2;
    this.active[2] = pinn !== null && pinn.states.length >= 2;
    this.reset();
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
    this.states[0].set(this.release);
    this.sample(1);
    this.sample(2);
  }

  tick(elapsed: number): void {
    if (this.playing) {
      this.accumulator += Math.min(elapsed, 0.05) * this.speed;
      let steps = Math.floor(this.accumulator / DEFAULT_DT);
      if (steps > 480) {
        steps = 480;
        this.accumulator = 0;
      } else {
        this.accumulator -= steps * DEFAULT_DT;
      }
      for (let i = 0; i < steps; i++) {
        this.time = springRk4(this.states[0], this.params, this.time, DEFAULT_DT, this.states[0]);
        this.stepCount++;
      }
      if (steps > 0) {
        this.sample(1);
        this.sample(2);
      }
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

  energy(slot: number): number {
    return springEnergy(this.states[slot], this.params).total;
  }

  private sample(slot: number): void {
    const trajectory = this.trajectories[slot];
    const state = this.states[slot];
    if (!trajectory || !this.active[slot]) {
      state.set(this.release);
      return;
    }
    const last = trajectory.states.length / 2 - 1;
    const position = Math.min(this.time / trajectory.dt, last);
    const index = Math.min(Math.floor(position), Math.max(last - 1, 0));
    const fraction = last === 0 ? 0 : position - index;
    const a = index * 2;
    const b = Math.min(index + 1, last) * 2;
    state[0] = trajectory.states[a] + (trajectory.states[b] - trajectory.states[a]) * fraction;
    state[1] = trajectory.states[a + 1] + (trajectory.states[b + 1] - trajectory.states[a + 1]) * fraction;
  }
}
