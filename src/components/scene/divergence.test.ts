import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, simulate } from "@/engine";
import { divergenceTime } from "./divergence";

describe("divergenceTime", () => {
  it("stays near the end when the trajectory is the physics itself", () => {
    const initial = [0.4, -0.2, 0, 0];
    const truth = simulate(initial, DEFAULT_PARAMS, 200, 0.02);
    const time = divergenceTime(truth, 0.02, DEFAULT_PARAMS, initial);
    expect(time).toBeGreaterThan(3);
  });

  it("jumps back just before a large tip error", () => {
    const initial = [1.2, -0.4, 0, 0];
    const trajectory = new Float32Array(40);
    trajectory.set(initial, 0);
    trajectory[20] = initial[0] + 1.4;
    const time = divergenceTime(trajectory, 0.5, DEFAULT_PARAMS, initial);
    expect(time).toBeLessThan(2);
    expect(time).toBeGreaterThanOrEqual(0);
  });
});
