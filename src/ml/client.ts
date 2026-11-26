import type { OrbitalParams, PendulumParams, ProjectileParams, SpringParams } from "../engine";
import type { ExperimentId, InMessage, OutMessage } from "./messages";
import type { OrbitalTrainResult } from "./orbital";
import type { ProjectileTrainResult } from "./projectile";
import type { ResultRow } from "./results";
import type { TrainSummary } from "./session";
import type { SpringTrainResult } from "./spring";
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
    args: {
      fraction: number;
      lambda: number;
      params: PendulumParams;
      seed: number;
      steps?: number;
      calibrate?: boolean;
      targetMs?: number;
    },
    onProgress?: (progress: TrainProgress) => void,
  ): Promise<TrainSummary> {
    const id = this.nextId++;
    return this.send({ id, type: "train", ...args }, onProgress).then((message) => {
      if (message.type !== "trained") throw new Error("Unexpected worker response");
      return message.summary;
    });
  }

  trainSpring(
    args: { fraction: number; lambda: number; params: SpringParams; seed: number; steps?: number },
    onProgress?: (progress: TrainProgress) => void,
  ): Promise<SpringTrainResult> {
    const id = this.nextId++;
    return this.send({ id, type: "train-spring", ...args }, onProgress).then((message) => {
      if (message.type !== "spring-trained") throw new Error("Unexpected worker response");
      return message.summary;
    });
  }

  loadSpring(): Promise<void> {
    const id = this.nextId++;
    return this.send({ id, type: "load-spring" }).then((message) => {
      if (message.type !== "pretrained") throw new Error("Unexpected worker response");
    });
  }

  rolloutSpring(
    initial: number[],
    seconds: number,
    params: SpringParams,
  ): Promise<{ nn: Float32Array; pinn: Float32Array; dt: number }> {
    const id = this.nextId++;
    return this.send({ id, type: "rollout-spring", initial, seconds, params }).then((message) => {
      if (message.type !== "rollout") throw new Error("Unexpected worker response");
      return { nn: new Float32Array(message.nn), pinn: new Float32Array(message.pinn), dt: message.dt };
    });
  }

  trainProjectile(
    args: {
      fraction: number;
      lambda: number;
      params: ProjectileParams;
      seed: number;
      steps?: number;
      calibrate?: boolean;
      targetMs?: number;
    },
    onProgress?: (progress: TrainProgress) => void,
  ): Promise<ProjectileTrainResult> {
    const id = this.nextId++;
    return this.send({ id, type: "train-projectile", ...args }, onProgress).then((message) => {
      if (message.type !== "projectile-trained") throw new Error("Unexpected worker response");
      return message.summary;
    });
  }

  loadProjectile(): Promise<void> {
    const id = this.nextId++;
    return this.send({ id, type: "load-projectile" }).then((message) => {
      if (message.type !== "pretrained") throw new Error("Unexpected worker response");
    });
  }

  rolloutProjectile(
    initial: number[],
    seconds: number,
    params: ProjectileParams,
  ): Promise<{ nn: Float32Array; pinn: Float32Array; dt: number }> {
    const id = this.nextId++;
    return this.send({ id, type: "rollout-projectile", initial, seconds, params }).then((message) => {
      if (message.type !== "rollout") throw new Error("Unexpected worker response");
      return { nn: new Float32Array(message.nn), pinn: new Float32Array(message.pinn), dt: message.dt };
    });
  }

  trainOrbital(
    args: {
      fraction: number;
      lambda: number;
      params: OrbitalParams;
      seed: number;
      steps?: number;
      calibrate?: boolean;
      targetMs?: number;
    },
    onProgress?: (progress: TrainProgress) => void,
  ): Promise<OrbitalTrainResult> {
    const id = this.nextId++;
    return this.send({ id, type: "train-orbital", ...args }, onProgress).then((message) => {
      if (message.type !== "orbital-trained") throw new Error("Unexpected worker response");
      return message.summary;
    });
  }

  loadOrbital(): Promise<void> {
    const id = this.nextId++;
    return this.send({ id, type: "load-orbital" }).then((message) => {
      if (message.type !== "pretrained") throw new Error("Unexpected worker response");
    });
  }

  rolloutOrbital(
    initial: number[],
    seconds: number,
    params: OrbitalParams,
  ): Promise<{ nn: Float32Array; pinn: Float32Array; dt: number }> {
    const id = this.nextId++;
    return this.send({ id, type: "rollout-orbital", initial, seconds, params }).then((message) => {
      if (message.type !== "rollout") throw new Error("Unexpected worker response");
      return { nn: new Float32Array(message.nn), pinn: new Float32Array(message.pinn), dt: message.dt };
    });
  }

  loadPretrained(system = "double-pendulum"): Promise<void> {
    const id = this.nextId++;
    return this.send({ id, type: "load-pretrained", system }).then((message) => {
      if (message.type !== "pretrained") throw new Error("Unexpected worker response");
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
