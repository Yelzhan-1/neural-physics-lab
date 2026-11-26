"use client";

import { useEffect, useRef, useState } from "react";
import type { PendulumParams } from "@/engine";
import type { LabRuntime } from "@/components/scene/runtime";
import { ROLLOUT_SECONDS, SEED } from "@/ml/constants";
import { MlClient } from "@/ml/client";
import type { TrainSummary } from "@/ml/session";
import type { TrainProgress } from "@/ml/train";

export type TrainStatus = "idle" | "training" | "trained";

export interface LabModels {
  status: TrainStatus;
  nnLoss: number[];
  pinnLoss: number[];
  progress: TrainProgress | null;
  summary: TrainSummary | null;
  error: string | null;
  note: string | null;
  backend: string | null;
  train: (fraction: number, lambda: number) => void;
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

/**
 * Trains in a worker and, once the weights exist, rolls both models out from
 * the current release pose. Changing a physical parameter clears the weights:
 * they were trained for the previous system.
 */
export function useLabModels(
  runtime: LabRuntime,
  pose: { theta1: number; theta2: number; params: PendulumParams },
): LabModels {
  const clientRef = useRef<MlClient | null>(null);
  const trainedParams = useRef<PendulumParams | null>(null);
  const poseRef = useRef(pose);
  const nnRef = useRef<number[]>([]);
  const pinnRef = useRef<number[]>([]);
  const [status, setStatus] = useState<TrainStatus>("idle");
  const [nnLoss, setNnLoss] = useState<number[]>([]);
  const [pinnLoss, setPinnLoss] = useState<number[]>([]);
  const [progress, setProgress] = useState<TrainProgress | null>(null);
  const [summary, setSummary] = useState<TrainSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    poseRef.current = pose;
  }, [pose]);

  useEffect(() => () => clientRef.current?.terminate(), []);

  const ensure = () => {
    if (!clientRef.current) clientRef.current = new MlClient();
    return clientRef.current;
  };

  const train = (fraction: number, lambda: number) => {
    const client = ensure();
    const token = ++generation.current;
    const params = { ...poseRef.current.params };
    nnRef.current = [];
    pinnRef.current = [];
    setNnLoss([]);
    setPinnLoss([]);
    setProgress(null);
    setSummary(null);
    setError(null);
    setNote(null);
    setStatus("training");
    runtime.setTrajectories({ nn: null, pinn: null });
    void client
      .train({ fraction, lambda, params, seed: SEED }, (update) => {
        if (token !== generation.current) return;
        const series = update.model === "nn" ? nnRef.current : pinnRef.current;
        series[update.step - 1] = update.dataLoss;
        if (update.step % 4 === 0 || update.step === update.steps) {
          setProgress(update);
          setNnLoss(nnRef.current.slice());
          setPinnLoss(pinnRef.current.slice());
          if (client.backend) setBackend(client.backend);
        }
      })
      .then((trained) => {
        if (token !== generation.current) return;
        if (!sameParams(trained.params, poseRef.current.params)) {
          setStatus("idle");
          setNote("Parameters changed during training. Train again to match the sandbox.");
          return;
        }
        trainedParams.current = trained.params;
        setSummary(trained);
        setNnLoss(nnRef.current.slice());
        setPinnLoss(pinnRef.current.slice());
        setStatus("trained");
        if (client.backend) setBackend(client.backend);
      })
      .catch((reason: unknown) => {
        if (token !== generation.current) return;
        const message = reason instanceof Error ? reason.message : "Training failed";
        if (message === "cancelled") return;
        setStatus("idle");
        setError(message);
      });
  };

  const { theta1, theta2, params } = pose;
  useEffect(() => {
    if (status !== "trained" || !trainedParams.current || !clientRef.current) return;
    if (!sameParams(trainedParams.current, params)) {
      trainedParams.current = null;
      setSummary(null);
      setStatus("idle");
      setNote("Parameters changed. Train again to match the sandbox.");
      runtime.setTrajectories({ nn: null, pinn: null });
      return;
    }
    const client = clientRef.current;
    let cancelled = false;
    const handle = setTimeout(() => {
      void client
        .rollout([(theta1 * Math.PI) / 180, (theta2 * Math.PI) / 180, 0, 0], ROLLOUT_SECONDS)
        .then((result) => {
          if (cancelled) return;
          runtime.setTrajectories({
            nn: { states: result.nn, dt: result.dt },
            pinn: { states: result.pinn, dt: result.dt },
          });
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          const message = reason instanceof Error ? reason.message : "Rollout failed";
          if (message === "cancelled") return;
          setError(message);
        });
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [status, theta1, theta2, params, runtime]);

  return { status, nnLoss, pinnLoss, progress, summary, error, note, backend, train };
}
