import type { PendulumParams } from "../engine";
import type { ResultRow } from "./results";
import type { TrainSummary } from "./session";
import type { TrainProgress } from "./train";

export type ExperimentId = "E1" | "E2" | "E3" | "E4";

export type InMessage =
  | {
      id: number;
      type: "train";
      fraction: number;
      lambda: number;
      params: PendulumParams;
      seed: number;
    }
  | { id: number; type: "rollout"; initial: number[]; seconds: number }
  | { id: number; type: "experiment"; experiment: ExperimentId }
  | { id: number; type: "clear" };

export type OutMessage =
  | { type: "ready"; backend: string }
  | { id: number; type: "progress"; progress: TrainProgress }
  | { id: number; type: "trained"; summary: TrainSummary }
  | { id: number; type: "rollout"; nn: ArrayBuffer; pinn: ArrayBuffer; dt: number }
  | { id: number; type: "experiment"; rows: ResultRow[] }
  | { id: number; type: "cleared" }
  | { id: number; type: "error"; message: string };
