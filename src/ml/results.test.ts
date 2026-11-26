import { describe, expect, it } from "vitest";
import { meanStd, seedSummary, takeaway, type ResultRow } from "./results";

function row(nnMse: number, pinnMse: number, id = "E1"): ResultRow {
  const metrics = (mse: number) => ({ mse, mae: mse / 2, energyDrift: mse / 10, msPerStep: 0.3 });
  return {
    id,
    experiment: id.startsWith("E2") ? "E2" : id.startsWith("E3") ? "E3" : id.startsWith("E4") ? "E4" : "E1",
    name: id,
    setting: id,
    horizonSeconds: 2,
    trainPairs: 10,
    basePairs: 100,
    testTrajectories: 2,
    nn: metrics(nnMse),
    pinn: metrics(pinnMse),
    winner: nnMse < pinnMse ? "nn" : "pinn",
  };
}

describe("result summaries", () => {
  it("reports a sample standard deviation", () => {
    const stats = meanStd([2, 4, 6]);
    expect(stats.mean).toBe(4);
    expect(stats.std).toBeCloseTo(2, 6);
  });

  it("averages a seed sweep without dropping a model that wins a row", () => {
    const summary = seedSummary("E1", "Standard conditions", [2026, 7, 42], [
      row(2, 1),
      row(4, 3),
      row(1, 2),
    ]);
    expect(summary.nnMseMean).toBeCloseTo(7 / 3, 6);
    expect(summary.pinnMseMean).toBeCloseTo(2, 6);
    expect(summary.nnMseStd).toBeGreaterThan(0);
  });

  it("keeps the short takeaway when no seed sweep is attached", () => {
    const text = takeaway([
      row(5, 3, "E1"),
      row(10, 4, "E2-5"),
      row(8, 2, "E3"),
      row(1, 0.8, "E4-1"),
      row(4, 2, "E4-3"),
      row(9, 3, "E4-10"),
    ]);
    expect(text).toContain("PINN");
    expect(text).not.toContain("Across seeds");
  });
});
