import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../engine";
import { MODEL_DT } from "./constants";
import { generateDataset } from "./dataset";
import { integrateTrajectory } from "./integrate";

const base = {
  seed: 7,
  params: { ...DEFAULT_PARAMS },
  angleMin: 0.2,
  angleMax: 1.4,
  omegaMax: 0.5,
  trainTrajectories: 4,
  testTrajectories: 2,
  trainSeconds: 0.4,
  testSeconds: 0.2,
  collocation: 24,
  collocationAngle: Math.PI,
  collocationOmega: 8,
} as const;

describe("dataset generation", () => {
  it("is deterministic for a seed and changes when the seed changes", () => {
    const first = generateDataset(base);
    const second = generateDataset(base);
    expect(Array.from(first.trainState)).toEqual(Array.from(second.trainState));
    expect(Array.from(first.trainNext)).toEqual(Array.from(second.trainNext));
    expect(Array.from(first.testStates)).toEqual(Array.from(second.testStates));
    expect(Array.from(first.collocation)).toEqual(Array.from(second.collocation));

    const other = generateDataset({ ...base, seed: base.seed + 1 });
    expect(Array.from(other.trainState)).not.toEqual(Array.from(first.trainState));
  });

  it("cuts nested fractions from one shuffled pool and keeps the test set fixed", () => {
    const full = generateDataset({ ...base, fraction: 1 });
    const half = generateDataset({ ...base, fraction: 0.5 });
    const tenth = generateDataset({ ...base, fraction: 0.1 });
    expect(half.count).toBe(Math.max(1, Math.round(full.basePairs * 0.5)));
    expect(tenth.count).toBe(Math.max(1, Math.round(full.basePairs * 0.1)));
    expect(Array.from(half.trainState)).toEqual(
      Array.from(full.trainState.subarray(0, half.count * 4)),
    );
    expect(Array.from(half.trainNext)).toEqual(
      Array.from(full.trainNext.subarray(0, half.count * 4)),
    );
    expect(Array.from(tenth.trainNext)).toEqual(
      Array.from(full.trainNext.subarray(0, tenth.count * 4)),
    );
    expect(Array.from(half.testStates)).toEqual(Array.from(full.testStates));
    expect(half.basePairs).toBe(full.basePairs);
  });

  it("labels each training pair with one engine step", () => {
    const data = generateDataset({ ...base, fraction: 1, trainTrajectories: 2, trainSeconds: 0.2 });
    expect(data.count).toBeGreaterThan(0);
    for (let i = 0; i < data.count; i++) {
      const state = data.trainState.subarray(i * 4, i * 4 + 4);
      const expected = integrateTrajectory(state, data.params, 1, data.dt);
      for (let j = 0; j < 4; j++) {
        expect(data.trainNext[i * 4 + j]).toBeCloseTo(expected[4 + j], 4);
      }
    }
  });

  it("keeps release angles inside the requested range and collocation unlabeled", () => {
    const data = generateDataset({
      ...base,
      fraction: 1,
      trainTrajectories: 8,
      trainSeconds: MODEL_DT,
      testSeconds: MODEL_DT,
      angleMin: 0.05,
      angleMax: 0.4,
      testAngleMin: 1.2,
      testAngleMax: 2.2,
      omegaMax: 0,
      restFraction: 1,
    });
    for (let i = 0; i < data.count; i++) {
      expect(Math.abs(data.trainState[i * 4])).toBeGreaterThanOrEqual(0.05 - 1e-6);
      expect(Math.abs(data.trainState[i * 4])).toBeLessThanOrEqual(0.4 + 1e-6);
      expect(Math.abs(data.trainState[i * 4 + 1])).toBeLessThanOrEqual(0.4 + 1e-6);
      expect(data.trainState[i * 4 + 2]).toBe(0);
      expect(data.trainState[i * 4 + 3]).toBe(0);
    }
    const stride = (data.testSteps + 1) * 4;
    for (let t = 0; t < data.testCount; t++) {
      const theta1 = Math.abs(data.testStates[t * stride]);
      const theta2 = Math.abs(data.testStates[t * stride + 1]);
      expect(theta1).toBeGreaterThanOrEqual(1.2 - 1e-6);
      expect(theta1).toBeLessThanOrEqual(2.2 + 1e-6);
      expect(theta2).toBeGreaterThanOrEqual(1.2 - 1e-6);
      expect(theta2).toBeLessThanOrEqual(2.2 + 1e-6);
    }
    expect(data.collocation.length / 4).toBe(24);
    for (let i = 0; i < data.collocation.length / 4; i++) {
      expect(Math.abs(data.collocation[i * 4])).toBeLessThanOrEqual(Math.PI + 1e-6);
      expect(Math.abs(data.collocation[i * 4 + 1])).toBeLessThanOrEqual(Math.PI + 1e-6);
      expect(Math.abs(data.collocation[i * 4 + 2])).toBeLessThanOrEqual(8 + 1e-6);
      expect(Math.abs(data.collocation[i * 4 + 3])).toBeLessThanOrEqual(8 + 1e-6);
    }
  });
});
