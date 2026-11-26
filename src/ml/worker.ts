/// <reference lib="webworker" />

import * as tf from "@tensorflow/tfjs";
import { runExperiment } from "./experiments";
import { CancelledError } from "./train";
import type { InMessage, OutMessage } from "./messages";
import { OrbitalSession } from "./orbital";
import { ProjectileSession } from "./projectile";
import { LabSession } from "./session";
import { SpringSession } from "./spring";

const lab = new LabSession();
const spring = new SpringSession();
const projectile = new ProjectileSession();
const orbital = new OrbitalSession();
let generation = 0;

function post(message: OutMessage, transfer?: Transferable[]): void {
  if (transfer) self.postMessage(message, transfer);
  else self.postMessage(message);
}

async function setup(): Promise<void> {
  tf.enableProdMode();
  const webgl = await tf.setBackend("webgl").catch(() => false);
  if (!webgl || tf.getBackend() !== "webgl") await tf.setBackend("cpu");
  await tf.ready();
  post({ type: "ready", backend: tf.getBackend() });
}

const ready = setup();

async function handle(message: InMessage): Promise<void> {
  await ready;
  const mine = ++generation;
  const stopped = () => mine !== generation;
  try {
    if (message.type === "clear") {
      lab.clear();
      post({ id: message.id, type: "cleared" });
      return;
    }
    if (message.type === "load-pretrained") {
      await lab.loadPretrained(message.system, self.location.origin);
      if (stopped()) return;
      post({ id: message.id, type: "pretrained" });
      return;
    }
    if (message.type === "train") {
      const summary = await lab.train(
        {
          fraction: message.fraction,
          lambda: message.lambda,
          params: message.params,
          seed: message.seed,
          steps: message.steps,
          calibrate: message.calibrate,
          targetMs: message.targetMs,
        },
        (progress) => {
          if (!stopped()) post({ id: message.id, type: "progress", progress });
        },
        stopped,
      );
      if (stopped()) return;
      post({ id: message.id, type: "trained", summary });
      return;
    }
    if (message.type === "load-spring") {
      await spring.loadPretrained(self.location.origin);
      if (stopped()) return;
      post({ id: message.id, type: "pretrained" });
      return;
    }
    if (message.type === "train-spring") {
      const summary = await spring.train(
        {
          fraction: message.fraction,
          lambda: message.lambda,
          params: message.params,
          seed: message.seed,
          steps: message.steps,
        },
        (progress) => {
          if (!stopped()) post({ id: message.id, type: "progress", progress });
        },
        stopped,
      );
      if (stopped()) return;
      post({ id: message.id, type: "spring-trained", summary });
      return;
    }
    if (message.type === "rollout-spring") {
      if (stopped()) return;
      const result = spring.rollout(message.initial, message.seconds, message.params);
      const nn = result.nn.buffer as ArrayBuffer;
      const pinn = result.pinn.buffer as ArrayBuffer;
      post({ id: message.id, type: "rollout", nn, pinn, dt: result.dt }, [nn, pinn]);
      return;
    }
    if (message.type === "load-projectile") {
      await projectile.loadPretrained(self.location.origin);
      if (stopped()) return;
      post({ id: message.id, type: "pretrained" });
      return;
    }
    if (message.type === "train-projectile") {
      const summary = await projectile.train(
        {
          fraction: message.fraction,
          lambda: message.lambda,
          params: message.params,
          seed: message.seed,
          steps: message.steps,
          calibrate: message.calibrate,
          targetMs: message.targetMs,
        },
        (progress) => {
          if (!stopped()) post({ id: message.id, type: "progress", progress });
        },
        stopped,
      );
      if (stopped()) return;
      post({ id: message.id, type: "projectile-trained", summary });
      return;
    }
    if (message.type === "rollout-projectile") {
      if (stopped()) return;
      const result = projectile.rollout(message.initial, message.seconds, message.params);
      const nn = result.nn.buffer as ArrayBuffer;
      const pinn = result.pinn.buffer as ArrayBuffer;
      post({ id: message.id, type: "rollout", nn, pinn, dt: result.dt }, [nn, pinn]);
      return;
    }
    if (message.type === "load-orbital") {
      await orbital.loadPretrained(self.location.origin);
      if (stopped()) return;
      post({ id: message.id, type: "pretrained" });
      return;
    }
    if (message.type === "train-orbital") {
      const summary = await orbital.train(
        {
          fraction: message.fraction,
          lambda: message.lambda,
          params: message.params,
          seed: message.seed,
          steps: message.steps,
          calibrate: message.calibrate,
          targetMs: message.targetMs,
        },
        (progress) => {
          if (!stopped()) post({ id: message.id, type: "progress", progress });
        },
        stopped,
      );
      if (stopped()) return;
      post({ id: message.id, type: "orbital-trained", summary });
      return;
    }
    if (message.type === "rollout-orbital") {
      if (stopped()) return;
      const result = orbital.rollout(message.initial, message.seconds, message.params);
      const nn = result.nn.buffer as ArrayBuffer;
      const pinn = result.pinn.buffer as ArrayBuffer;
      post({ id: message.id, type: "rollout", nn, pinn, dt: result.dt }, [nn, pinn]);
      return;
    }
    if (message.type === "rollout") {
      if (stopped()) return;
      const result = lab.rollout(message.initial, message.seconds);
      const nn = result.nn.buffer as ArrayBuffer;
      const pinn = result.pinn.buffer as ArrayBuffer;
      post({ id: message.id, type: "rollout", nn, pinn, dt: result.dt }, [nn, pinn]);
      return;
    }
    if (message.type !== "experiment") {
      throw new Error(`Unknown worker message`);
    }
    const rows = await runExperiment(message.experiment, {
      onProgress: (progress) => {
        if (!stopped()) post({ id: message.id, type: "progress", progress });
      },
      shouldStop: stopped,
    });
    if (stopped()) return;
    post({ id: message.id, type: "experiment", rows });
  } catch (error) {
    if (error instanceof CancelledError || stopped()) return;
    const text = error instanceof Error ? error.message : "Training failed";
    post({ id: message.id, type: "error", message: text });
  }
}

self.onmessage = (event: MessageEvent<InMessage>) => {
  void handle(event.data);
};
