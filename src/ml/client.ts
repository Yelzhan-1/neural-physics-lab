import type { PendulumParams } from "../engine";
import type { ExperimentId, InMessage, OutMessage } from "./messages";
import type { ResultRow } from "./results";
import type { TrainSummary } from "./session";
import type { TrainProgress } from "./train";

interface Pending {
  resolve: (message: OutMessage) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: TrainProgress) => void;
}

/** Talks to the TensorFlow.js worker. The main thread never runs a training step. */
export class MlClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  backend: string | null = null;

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<OutMessage>) => this.receive(event.data);
    this.worker.onerror = (event: ErrorEvent) => {
      const message = event.message || "The training worker failed";
      for (const pending of this.pending.values()) pending.reject(new Error(message));
      this.pending.clear();
    };
  }

  private receive(message: OutMessage): void {
    if (message.type === "ready") {
      this.backend = message.backend;
      return;
    }
    if (!("id" in message) || message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (message.type === "progress") {
      pending.onProgress?.(message.progress);
      return;
    }
    this.pending.delete(message.id);
    if (message.type === "error") pending.reject(new Error(message.message));
    else pending.resolve(message);
  }

  private send(message: InMessage, onProgress?: (progress: TrainProgress) => void): Promise<OutMessage> {
    for (const pending of this.pending.values()) pending.reject(new Error("cancelled"));
    this.pending.clear();
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject, onProgress });
      this.worker.postMessage(message);
    });
  }

  train(
    args: { fraction: number; lambda: number; params: PendulumParams; seed: number },
    onProgress?: (progress: TrainProgress) => void,
  ): Promise<TrainSummary> {
    const id = this.nextId++;
    return this.send({ id, type: "train", ...args }, onProgress).then((message) => {
      if (message.type !== "trained") throw new Error("Unexpected worker response");
      return message.summary;
    });
  }

  rollout(initial: number[], seconds: number): Promise<{ nn: Float32Array; pinn: Float32Array; dt: number }> {
    const id = this.nextId++;
    return this.send({ id, type: "rollout", initial, seconds }).then((message) => {
      if (message.type !== "rollout") throw new Error("Unexpected worker response");
      return { nn: new Float32Array(message.nn), pinn: new Float32Array(message.pinn), dt: message.dt };
    });
  }

  experiment(
    experiment: ExperimentId,
    onProgress?: (progress: TrainProgress) => void,
  ): Promise<ResultRow[]> {
    const id = this.nextId++;
    return this.send({ id, type: "experiment", experiment }, onProgress).then((message) => {
      if (message.type !== "experiment") throw new Error("Unexpected worker response");
      return message.rows;
    });
  }

  terminate(): void {
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error("Worker stopped"));
    this.pending.clear();
  }
}
