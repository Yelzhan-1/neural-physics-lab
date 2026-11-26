import { describe, expect, it } from "vitest";
import {
  DEFAULT_DT,
  DEFAULT_PARAMS,
  derivatives,
  energy,
  kinematics,
  normalModes,
  rk4Step,
  simulate,
  STATE_SIZE,
  type PendulumParams,
} from "./index";

const deg = (value: number) => (value * Math.PI) / 180;

/** Largest |E(t) - E(0)| / |E(0)| seen while integrating for `seconds`. */
function maxRelativeEnergyDrift(
  initial: number[],
  params: PendulumParams,
  seconds: number,
  dt: number,
): number {
  const state = Float64Array.from(initial);
  const initialEnergy = energy(state, params).total;
  const steps = Math.round(seconds / dt);
  let worst = 0;
  for (let i = 0; i < steps; i++) {
    rk4Step(state, params, dt, state);
    const drift = Math.abs(energy(state, params).total - initialEnergy);
    if (drift > worst) worst = drift;
  }
  return worst / Math.abs(initialEnergy);
}

describe("energy conservation", () => {
  const cases: { name: string; initial: number[]; params: PendulumParams }[] = [
    {
      name: "moderate swing, equal masses",
      initial: [deg(45), deg(-30), 0, 0],
      params: { ...DEFAULT_PARAMS },
    },
    {
      name: "large swing, both links horizontal",
      initial: [deg(90), deg(90), 0, 0],
      params: { ...DEFAULT_PARAMS },
    },
    {
      name: "chaotic regime, released above the pivot",
      initial: [deg(120), deg(-20), 0, 0],
      params: { ...DEFAULT_PARAMS },
    },
    {
      name: "unequal masses and lengths with initial spin",
      initial: [deg(60), deg(100), 0.5, -1],
      params: { ...DEFAULT_PARAMS, m1: 2, m2: 0.5, l1: 0.8, l2: 1.3 },
    },
  ];

  for (const { name, initial, params } of cases) {
    it(`relative drift stays below 1e-4 over 20 s: ${name}`, () => {
      const drift = maxRelativeEnergyDrift(initial, params, 20, DEFAULT_DT);
      expect(drift).toBeLessThan(1e-4);
    });
  }

  it("loses energy monotonically when damping is on", () => {
    const params = { ...DEFAULT_PARAMS, damping: 0.2 };
    const state = Float64Array.from([deg(90), deg(45), 0, 0]);
    let previous = energy(state, params).total;
    for (let i = 0; i < 240 * 10; i++) {
      rk4Step(state, params, DEFAULT_DT, state);
      const current = energy(state, params).total;
      expect(current).toBeLessThanOrEqual(previous + 1e-9);
      previous = current;
    }
    expect(previous).toBeLessThan(energy([deg(90), deg(45), 0, 0], params).total);
  });
});

describe("small-angle normal modes", () => {
  /** Frequency of theta1 measured from interpolated upward zero crossings. */
  function measuredOmega(params: PendulumParams, ratio: number): number {
    const amplitude = 0.01;
    const state = Float64Array.from([amplitude, amplitude * ratio, 0, 0]);
    const crossings: number[] = [];
    let previous = state[0];
    const steps = Math.round(30 / DEFAULT_DT);
    for (let i = 1; i <= steps; i++) {
      rk4Step(state, params, DEFAULT_DT, state);
      const current = state[0];
      if (previous < 0 && current >= 0) {
        const fraction = -previous / (current - previous);
        crossings.push((i - 1 + fraction) * DEFAULT_DT);
      }
      previous = current;
    }
    expect(crossings.length).toBeGreaterThan(3);
    const period =
      (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
    return (2 * Math.PI) / period;
  }

  const parameterSets: { name: string; params: PendulumParams }[] = [
    { name: "default parameters", params: { ...DEFAULT_PARAMS } },
    {
      name: "unequal masses and lengths",
      params: { ...DEFAULT_PARAMS, m1: 2, m2: 0.7, l1: 0.6, l2: 1.4 },
    },
  ];

  for (const { name, params } of parameterSets) {
    it(`both mode frequencies match the analytic values within 1%: ${name}`, () => {
      const modes = normalModes(params);
      for (const mode of modes) {
        const measured = measuredOmega(params, mode.ratio);
        expect(Math.abs(measured - mode.omega) / mode.omega).toBeLessThan(0.01);
      }
    });
  }

  it("reproduces the textbook result for equal masses and lengths", () => {
    const [slow, fast] = normalModes({ ...DEFAULT_PARAMS });
    const base = DEFAULT_PARAMS.g / DEFAULT_PARAMS.l1;
    expect(slow.omega).toBeCloseTo(Math.sqrt(base * (2 - Math.SQRT2)), 12);
    expect(fast.omega).toBeCloseTo(Math.sqrt(base * (2 + Math.SQRT2)), 12);
    expect(slow.ratio).toBeCloseTo(Math.SQRT2, 12);
    expect(fast.ratio).toBeCloseTo(-Math.SQRT2, 12);
  });
});

describe("determinism", () => {
  it("produces bit-identical trajectories for identical inputs", () => {
    const initial = [deg(120), deg(-20), 0.3, -0.1];
    const first = simulate(initial, DEFAULT_PARAMS, 4800);
    const second = simulate(initial, DEFAULT_PARAMS, 4800);
    expect(first.length).toBe(4801 * STATE_SIZE);
    expect(Buffer.from(first.buffer).equals(Buffer.from(second.buffer))).toBe(
      true,
    );
  });

  it("is unaffected by other simulations run in between", () => {
    const initial = [deg(75), deg(160), 0, 0];
    const first = simulate(initial, DEFAULT_PARAMS, 1000);
    simulate([1, 2, 3, 4], { ...DEFAULT_PARAMS, m2: 3 }, 500);
    const second = simulate(initial, DEFAULT_PARAMS, 1000);
    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it("simulate matches repeated rk4Step calls", () => {
    const initial = [deg(30), deg(60), 0, 0];
    const trajectory = simulate(initial, DEFAULT_PARAMS, 240);
    const state = Float64Array.from(initial);
    for (let i = 0; i < 240; i++) rk4Step(state, DEFAULT_PARAMS, DEFAULT_DT, state);
    for (let i = 0; i < STATE_SIZE; i++) {
      expect(trajectory[240 * STATE_SIZE + i]).toBe(Math.fround(state[i]));
    }
  });

  it("does not mutate its inputs", () => {
    const initial = [0.4, -0.2, 0.1, 0];
    const params = { ...DEFAULT_PARAMS };
    const stepped = rk4Step(initial, params);
    expect(initial).toEqual([0.4, -0.2, 0.1, 0]);
    expect(params).toEqual(DEFAULT_PARAMS);
    expect(stepped).not.toBe(initial);
  });
});

describe("equations of motion", () => {
  it("stays at rest in the stable equilibrium", () => {
    const result = derivatives([0, 0, 0, 0], DEFAULT_PARAMS);
    for (const value of result) expect(Math.abs(value)).toBe(0);
  });

  it("reduces to a simple pendulum when the second mass vanishes", () => {
    const params = { ...DEFAULT_PARAMS, m2: 1e-12 };
    const theta = 0.7;
    const result = derivatives([theta, theta, 0, 0], params);
    expect(result[2]).toBeCloseTo((-params.g / params.l1) * Math.sin(theta), 6);
  });

  it("rk4 converges with fourth order", () => {
    const initial = [2, 1, 0, 0];
    const seconds = 2;
    const integrate = (stepsPerSecond: number) => {
      const state = Float64Array.from(initial);
      for (let i = 0; i < stepsPerSecond * seconds; i++) {
        rk4Step(state, DEFAULT_PARAMS, 1 / stepsPerSecond, state);
      }
      return state;
    };
    const reference = integrate(20000);
    const errorAt = (stepsPerSecond: number) => {
      const state = integrate(stepsPerSecond);
      return Math.hypot(
        state[0] - reference[0],
        state[1] - reference[1],
        state[2] - reference[2],
        state[3] - reference[3],
      );
    };
    // Halving the step should cut the global error by about 2^4.
    const order = Math.log2(errorAt(200) / errorAt(400));
    expect(order).toBeGreaterThan(3.5);
    expect(order).toBeLessThan(4.5);
  });
});

describe("kinematics", () => {
  it("places the bobs from the angles", () => {
    const result = kinematics([Math.PI / 2, 0, 0, 0], {
      ...DEFAULT_PARAMS,
      l1: 2,
      l2: 0.5,
    });
    expect(result.x1).toBeCloseTo(2, 12);
    expect(result.y1).toBeCloseTo(0, 12);
    expect(result.x2).toBeCloseTo(2, 12);
    expect(result.y2).toBeCloseTo(-0.5, 12);
  });

  it("velocities and accelerations match finite differences of position", () => {
    const params = { ...DEFAULT_PARAMS, m2: 0.6, l2: 1.2 };
    const h = 1e-4;
    const steps = 20;
    const before = Float64Array.from([deg(50), deg(-70), 0.8, -1.1]);
    const middle = Float64Array.from(before);
    for (let i = 0; i < steps; i++) rk4Step(middle, params, h / steps, middle);
    const after = Float64Array.from(middle);
    for (let i = 0; i < steps; i++) rk4Step(after, params, h / steps, after);

    const a = kinematics(before, params);
    const b = kinematics(middle, params);
    const c = kinematics(after, params);

    expect((c.x2 - a.x2) / (2 * h)).toBeCloseTo(b.vx2, 5);
    expect((c.y2 - a.y2) / (2 * h)).toBeCloseTo(b.vy2, 5);
    expect((c.vx2 - a.vx2) / (2 * h)).toBeCloseTo(b.ax2, 5);
    expect((c.vy2 - a.vy2) / (2 * h)).toBeCloseTo(b.ay2, 5);
    expect((c.vx1 - a.vx1) / (2 * h)).toBeCloseTo(b.ax1, 5);
    expect((c.vy1 - a.vy1) / (2 * h)).toBeCloseTo(b.ay1, 5);
  });

  it("kinetic energy equals the sum of 1/2 m v^2 of the bobs", () => {
    const params = { ...DEFAULT_PARAMS, m1: 1.5, m2: 0.4 };
    const state = [deg(35), deg(110), 1.2, -0.7];
    const k = kinematics(state, params);
    const expected =
      0.5 * params.m1 * (k.vx1 ** 2 + k.vy1 ** 2) +
      0.5 * params.m2 * (k.vx2 ** 2 + k.vy2 ** 2);
    expect(energy(state, params).kinetic).toBeCloseTo(expected, 12);
  });
});
