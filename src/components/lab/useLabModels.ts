"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PARAMS, type PendulumParams } from "@/engine";
import { divergenceTime } from "@/components/scene/divergence";
import type { LabRuntime } from "@/components/scene/runtime";
import {
  DEMO_ROLLOUT_URL,
  DEMO_THETA1,
  DEMO_THETA2,
  LIVE_TRAIN_TARGET_MS,
  PRETRAIN_STEPS,
  QUICK_TRAIN_TARGET_MS,
  ROLLOUT_SECONDS,
  SEED,
} from "@/ml/constants";
import { MlClient } from "@/ml/client";
import type { TrainSummary } from "@/ml/session";
import type { TrainProgress } from "@/ml/train";

export type TrainStatus = "idle" | "loading" | "training" | "trained" | "pretrained";
export type ModelOrigin = "pretrained" | "live" | "custom" | null;

export interface DemoRolloutFile {
  dt: number;
  theta1: number;
  theta2: number;
  stepsTrained: number;
  nn: number[];
  pinn: number[];
}

export interface LabModels {
  status: TrainStatus;
  origin: ModelOrigin;
  nnLoss: number[];
  pinnLoss: number[];
  progress: TrainProgress | null;
  summary: TrainSummary | null;
  error: string | null;
  note: string | null;
  backend: string | null;
  etaSeconds: number | null;
  phase: "calibrating" | "training" | null;
  pretrainedSteps: number;
  slotsReady: boolean;
  /** Bumps after a live train seeks to the split, so the lab can switch to 2×. */
  jump: { id: number; time: number } | null;
  train: (fraction: number, lambda: number, steps?: number) => void;
  liveTrain: () => void;
  quickTrain: () => void;
  usePretrained: () => void;
}

function sameParams(a: PendulumParams, b: PendulumParams): boolean {
  return (
    a.m1 === b.m1 &&
    a.m2 === b.m2 &&
    a.l1 === b.l1 &&
    a.l2 === b.l2 &&
    a.g === b.g &&
    a.damping === b.damping
  );
}

function releaseOf(pose: { theta1: number; theta2: number }): number[] {
  return [(pose.theta1 * Math.PI) / 180, (pose.theta2 * Math.PI) / 180, 0, 0];
}

/**
 * Shows the committed demo rollout immediately, and trains in a worker when
 * asked. The worker is created on the first train or pose change, not during
 * the first paint, so the RK4 clock is never blocked on TensorFlow.
 */
export function useLabModels(
  runtime: LabRuntime,
  pose: { theta1: number; theta2: number; params: PendulumParams },
  demo = false,
  onLiveReady?: { current: () => void },
): LabModels {
  const clientRef = useRef<MlClient | null>(null);
  const trainedParams = useRef<PendulumParams | null>(null);
  const poseRef = useRef(pose);
  const cacheRef = useRef<DemoRolloutFile | null>(null);
  const nnRef = useRef<number[]>([]);
  const pinnRef = useRef<number[]>([]);
  const wantJump = useRef(false);
  const demoRef = useRef(demo);
  const training = useRef(false);
  const jumpCount = useRef(0);
  const generation = useRef(0);
  const [status, setStatus] = useState<TrainStatus>("idle");
  const [origin, setOrigin] = useState<ModelOrigin>(null);
  const [nnLoss, setNnLoss] = useState<number[]>([]);
  const [pinnLoss, setPinnLoss] = useState<number[]>([]);
  const [progress, setProgress] = useState<TrainProgress | null>(null);
  const [summary, setSummary] = useState<TrainSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [phase, setPhase] = useState<"calibrating" | "training" | null>(null);
  const [pretrainedSteps, setPretrainedSteps] = useState(PRETRAIN_STEPS);
  const [slotsReady, setSlotsReady] = useState(false);
  const [jump, setJump] = useState<{ id: number; time: number } | null>(null);

  useEffect(() => {
    poseRef.current = pose;
  }, [pose]);

  useEffect(() => {
    demoRef.current = demo;
  }, [demo]);

  useEffect(() => () => clientRef.current?.terminate(), []);

  const ensure = () => {
    if (!clientRef.current) clientRef.current = new MlClient();
    return clientRef.current;
  };

  const showRollout = useCallback(
    (nn: Float32Array, pinn: Float32Array, dt: number, seekSplit: boolean) => {
      runtime.setTrajectories({
        nn: { states: nn, dt },
        pinn: { states: pinn, dt },
      });
      setSlotsReady(true);
      if (!seekSplit && !demoRef.current) return;
      const current = poseRef.current;
      const time = divergenceTime(nn, dt, current.params, releaseOf(current));
      runtime.seek(time);
      if (!seekSplit) return;
      jumpCount.current += 1;
      setJump({ id: jumpCount.current, time });
      onLiveReady?.current();
    },
    [onLiveReady, runtime],
  );

  const applyCache = useCallback(
    (data: DemoRolloutFile) => {
      cacheRef.current = data;
      setPretrainedSteps(data.stepsTrained || PRETRAIN_STEPS);
      if (training.current) return;
      const current = poseRef.current;
      if (!sameParams(current.params, DEFAULT_PARAMS)) return;
      if (Math.abs(current.theta1 - data.theta1) > 0.2 || Math.abs(current.theta2 - data.theta2) > 0.2) return;
      showRollout(Float32Array.from(data.nn), Float32Array.from(data.pinn), data.dt, false);
      trainedParams.current = { ...DEFAULT_PARAMS };
      setOrigin("pretrained");
      setStatus("pretrained");
      setSummary(null);
      setError(null);
      setNote(null);
      setPhase(null);
      setEtaSeconds(null);
    },
    [showRollout],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch(DEMO_ROLLOUT_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Pretrained rollout responded ${response.status}`);
        return response.json() as Promise<DemoRolloutFile>;
      })
      .then((data) => {
        if (cancelled) return;
        applyCache(data);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "Pretrained rollout failed to load";
        setNote(message);
      });
    return () => {
      cancelled = true;
    };
  }, [applyCache]);

  const begin = (token: number) => {
    nnRef.current = [];
    pinnRef.current = [];
    setNnLoss([]);
    setPinnLoss([]);
    setProgress(null);
    setSummary(null);
    setError(null);
    setNote(null);
    setEtaSeconds(null);
    setPhase(null);
    setStatus("training");
    setSlotsReady(false);
    training.current = true;
    return token;
  };

  const watch = (token: number, client: MlClient) => (update: TrainProgress) => {
    if (token !== generation.current) return;
    const series = update.model === "nn" ? nnRef.current : pinnRef.current;
    series[update.step - 1] = update.dataLoss;
    if (update.step % 2 === 0 || update.step === update.steps || update.phase === "calibrating") {
      setProgress(update);
      setNnLoss(nnRef.current.slice());
      setPinnLoss(pinnRef.current.slice());
      setPhase(update.phase ?? "training");
      setEtaSeconds(update.etaSeconds ?? null);
      if (client.backend) setBackend(client.backend);
    }
  };

  const finish = (token: number, client: MlClient, trained: TrainSummary, nextOrigin: ModelOrigin) => {
    if (token !== generation.current) return;
    training.current = false;
    if (!sameParams(trained.params, poseRef.current.params)) {
      setStatus("idle");
      setNote("Parameters changed during training. Train again to match the sandbox.");
      return;
    }
    trainedParams.current = trained.params;
    setSummary(trained);
    setNnLoss(nnRef.current.slice());
    setPinnLoss(pinnRef.current.slice());
    setOrigin(nextOrigin);
    setPhase(null);
    setEtaSeconds(null);
    setStatus("trained");
    if (client.backend) setBackend(client.backend);
  };

  const fail = (token: number, reason: unknown) => {
    if (token !== generation.current) return;
    training.current = false;
    const message = reason instanceof Error ? reason.message : "Training failed";
    if (message === "cancelled") return;
    setStatus("idle");
    setPhase(null);
    setEtaSeconds(null);
    setError(message);
  };

  const train = (fraction: number, lambda: number, steps?: number) => {
    const client = ensure();
    const token = begin(++generation.current);
    wantJump.current = false;
    const params = { ...poseRef.current.params };
    void client
      .train({ fraction, lambda, params, seed: SEED, steps }, watch(token, client))
      .then((trained) => finish(token, client, trained, "custom"))
      .catch((reason: unknown) => fail(token, reason));
  };

  const calibrated = (targetMs: number, nextOrigin: ModelOrigin, jumpAfter: boolean) => {
    const client = ensure();
    const token = begin(++generation.current);
    wantJump.current = jumpAfter;
    const params = { ...poseRef.current.params };
    void client
      .train(
        { fraction: 1, lambda: 0.4, params, seed: SEED, calibrate: true, targetMs },
        watch(token, client),
      )
      .then((trained) => finish(token, client, trained, nextOrigin))
      .catch((reason: unknown) => fail(token, reason));
  };

  const liveTrain = () => calibrated(LIVE_TRAIN_TARGET_MS, "live", true);
  const quickTrain = () => calibrated(QUICK_TRAIN_TARGET_MS, "custom", false);

  const usePretrained = () => {
    generation.current += 1;
    training.current = false;
    wantJump.current = false;
    setError(null);
    setNote(null);
    setPhase(null);
    setEtaSeconds(null);
    setSummary(null);
    const cached = cacheRef.current;
    if (cached) {
      applyCache(cached);
      return;
    }
    setStatus("loading");
    void fetch(DEMO_ROLLOUT_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Pretrained rollout responded ${response.status}`);
        return response.json() as Promise<DemoRolloutFile>;
      })
      .then((data) => applyCache(data))
      .catch((reason: unknown) => {
        setStatus("idle");
        setError(reason instanceof Error ? reason.message : "Pretrained rollout failed to load");
      });
  };

  const { theta1, theta2, params } = pose;
  useEffect(() => {
    if (status !== "trained" && status !== "pretrained") return;
    if (!trainedParams.current) return;
    if (!sameParams(trainedParams.current, params)) {
      trainedParams.current = null;
      setSummary(null);
      setOrigin(null);
      setStatus("idle");
      setSlotsReady(false);
      setNote("Parameters changed. Train again to match the sandbox.");
      runtime.setTrajectories({ nn: null, pinn: null });
      return;
    }
    const cached = cacheRef.current;
    const cachePose =
      origin === "pretrained" &&
      cached &&
      Math.abs(theta1 - cached.theta1) <= 0.2 &&
      Math.abs(theta2 - cached.theta2) <= 0.2 &&
      sameParams(params, DEFAULT_PARAMS);
    if (cachePose) return;

    const client = ensure();
    let cancelled = false;
    const token = generation.current;
    const handle = setTimeout(() => {
      const initial = [(theta1 * Math.PI) / 180, (theta2 * Math.PI) / 180, 0, 0];
      const run = async () => {
        if (origin === "pretrained") await client.loadPretrained();
        return client.rollout(initial, ROLLOUT_SECONDS);
      };
      void run()
        .then((result) => {
          if (cancelled || token !== generation.current) return;
          showRollout(result.nn, result.pinn, result.dt, wantJump.current);
          wantJump.current = false;
          if (client.backend) setBackend(client.backend);
        })
        .catch((reason: unknown) => {
          if (cancelled || token !== generation.current) return;
          const message = reason instanceof Error ? reason.message : "Rollout failed";
          if (message === "cancelled") return;
          setError(message);
        });
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [status, origin, theta1, theta2, params, runtime, showRollout]);

  return {
    status,
    origin,
    nnLoss,
    pinnLoss,
    progress,
    summary,
    error,
    note,
    backend,
    etaSeconds,
    phase,
    pretrainedSteps,
    slotsReady,
    jump,
    train,
    liveTrain,
    quickTrain,
    usePretrained,
  };
}

export const DEMO_POSE = { theta1: DEMO_THETA1, theta2: DEMO_THETA2 };
