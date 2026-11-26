import * as tf from "@tensorflow/tfjs";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, derivatives, energy } from "../engine";
import { advance } from "./integrate";
import { derivativesTensor, energyTensor, physicsPenalty, physicsResidual } from "./physics";

const state = [0.7, -0.4, 0.3, -0.2];

beforeAll(async () => {
  await tf.setBackend("cpu");
  await tf.ready();
});

describe("physics residual", () => {
  it("matches the engine derivatives and energy", () => {
    const got = derivativesTensor(tf.tensor2d([state]), DEFAULT_PARAMS).dataSync();
    const expected = derivatives(state, DEFAULT_PARAMS);
    for (let i = 0; i < 4; i++) expect(got[i]).toBeCloseTo(expected[i], 4);

    const joules = energyTensor(tf.tensor2d([state]), DEFAULT_PARAMS).dataSync()[0];
    expect(joules).toBeCloseTo(energy(state, DEFAULT_PARAMS).total, 4);
  });

  it("is the predicted rate of change minus the analytic midpoint derivative", () => {
    const dt = 0.02;
    const next = Float64Array.from(state);
    advance(next, DEFAULT_PARAMS, dt);
    const residual = physicsResidual(
      tf.tensor2d([state]),
      tf.tensor2d([Array.from(next)]),
      DEFAULT_PARAMS,
      dt,
    ).dataSync();
    const mid = state.map((value, index) => (value + next[index]) / 2);
    const analytic = derivatives(mid, DEFAULT_PARAMS);
    for (let i = 0; i < 4; i++) {
      const predicted = (next[i] - state[i]) / dt;
      expect(residual[i]).toBeCloseTo(predicted - analytic[i], 3);
    }
  });

  it("is small for a real step and large when the step breaks the equations", () => {
    const dt = 0.02;
    const next = Float64Array.from(state);
    advance(next, DEFAULT_PARAMS, dt);
    const consistent = physicsResidual(
      tf.tensor2d([state]),
      tf.tensor2d([Array.from(next)]),
      DEFAULT_PARAMS,
      dt,
    ).dataSync();
    const bogus = state.map((value) => value + 0.5);
    const broken = physicsResidual(
      tf.tensor2d([state]),
      tf.tensor2d([bogus]),
      DEFAULT_PARAMS,
      dt,
    ).dataSync();
    const norm = (values: ArrayLike<number>) => Math.hypot(values[0], values[1], values[2], values[3]);
    expect(norm(consistent)).toBeLessThan(norm(broken) * 0.2);

    const consistentLoss = physicsPenalty(
      tf.tensor2d([state]),
      tf.tensor2d([Array.from(next)]),
      DEFAULT_PARAMS,
      dt,
    ).dataSync()[0];
    const brokenLoss = physicsPenalty(
      tf.tensor2d([state]),
      tf.tensor2d([bogus]),
      DEFAULT_PARAMS,
      dt,
    ).dataSync()[0];
    expect(consistentLoss).toBeLessThan(brokenLoss * 0.2);
    expect(consistentLoss).toBeGreaterThan(0);
  });

  it("is differentiable with respect to the predicted state", () => {
    const dt = 0.02;
    const next = Float64Array.from(state);
    advance(next, DEFAULT_PARAMS, dt);
    const start = tf.tensor2d([state]);
    const predicted = tf.tensor2d([Array.from(next)]);
    const grad = tf.grad((value: tf.Tensor) =>
      physicsPenalty(start, value as tf.Tensor2D, DEFAULT_PARAMS, dt),
    )(predicted);
    const values = Array.from(grad.dataSync());
    expect(values).toHaveLength(4);
    expect(values.every((value) => Number.isFinite(value))).toBe(true);
    expect(values.some((value) => Math.abs(value) > 1e-6)).toBe(true);
  });
});
