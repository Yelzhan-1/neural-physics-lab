import type { PendulumParams, SpringParams } from "../engine";
import type { ResultRow } from "./results";
import type { TrainSummary } from "./session";
import type { SpringTrainResult } from "./spring";
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
      steps?: number;
      calibrate?: boolean;
      targetMs?: number;
    }
  | { id: number; type: "rollout"; initial: number[]; seconds: number }
  | { id: number; type: "load-pretrained"; system: string }
  | {
      id: number;
      type: "train-spring";
      fraction: number;
      lambda: number;
      params: SpringParams;
      seed: number;
      steps?: number;
    }
  | { id: number; type: "rollout-spring"; initial: number[]; seconds: number; params: SpringParams }
  | { id: number; type: "load-spring" }
  | { id: number; type: "experiment"; experiment: ExperimentId }
  | { id: number; type: "clear" };

export type OutMessage =
  | { type: "ready"; backend: string }
  | { id: number; type: "progress"; progress: TrainProgress }
  | { id: number; type: "trained"; summary: TrainSummary }
  | { id: number; type: "rollout"; nn: ArrayBuffer; pinn: ArrayBuffer; dt: number }
  | { id: number; type: "pretrained" }
  | { id: number; type: "spring-trained"; summary: SpringTrainResult }
  | { id: number; type: "experiment"; rows: ResultRow[] }
  | { id: number; type: "cleared" }
  | { id: number; type: "error"; message: string };
