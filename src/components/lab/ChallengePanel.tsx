"use client";

import { useEffect, useRef, useState } from "react";
import type { PendulumParams } from "@/engine";
import type { LabRuntime } from "@/components/scene/runtime";
import { SpotlightCard } from "@/components/site/SpotlightCard";
import { Button } from "@/components/ui/button";
import type { LabModels } from "./useLabModels";

const STORAGE_KEY = "npl-challenge-v1";

function tip(state: ArrayLike<number>, params: PendulumParams): { x: number; y: number } {
  return {
    x: params.l1 * Math.sin(state[0]) + params.l2 * Math.sin(state[1]),
    y: -params.l1 * Math.cos(state[0]) - params.l2 * Math.cos(state[1]),
  };
}

function tipError(guess: ArrayLike<number>, truth: ArrayLike<number>, params: PendulumParams): number {
  const a = tip(guess, params);
  const b = tip(truth, params);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

interface Score {
  correct: number;
  total: number;
}

export function ChallengePanel({
  models,
  runtime,
  params,
  setPlaying,
  setSpeed,
  setAngles,
}: {
  models: LabModels;
  runtime: LabRuntime;
  params: PendulumParams;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setAngles: (theta1: number, theta2: number) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "running" | "revealed">("idle");
  const [pick, setPick] = useState<"nn" | "pinn" | null>(null);
  const [reveal, setReveal] = useState<{ nn: number; pinn: number; verdict: string } | null>(null);
  const [score, setScore] = useState<Score>(() => {
    if (typeof window === "undefined") return { correct: 0, total: 0 };
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as Score) : { correct: 0, total: 0 };
    } catch {
      return { correct: 0, total: 0 };
    }
  });
  const clockRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (phase !== "running") return;
    let done = false;
    return runtime.onFrame(() => {
      if (clockRef.current) clockRef.current.textContent = runtime.time.toFixed(2);
      if (done || runtime.time < 3) return;
      done = true;
      const nn = tipError(runtime.states[1], runtime.states[0], params);
      const pinn = tipError(runtime.states[2], runtime.states[0], params);
      const scale = Math.max(nn, pinn, 1e-6);
      const tie = Math.abs(nn - pinn) / scale < 0.02;
      const winner = tie ? null : nn < pinn ? "nn" : "pinn";
      const correct = winner !== null && winner === pick;
      const verdict = tie
        ? "Too close to call."
        : winner === "pinn"
          ? "PINN was closer."
          : "Standard NN was closer.";
      setReveal({ nn, pinn, verdict: `${verdict} ${correct ? "Your pick was right." : "Your pick was wrong."}` });
      setPhase("revealed");
      setPlaying(false);
      setScore((previous) => {
        const next = { correct: previous.correct + (correct ? 1 : 0), total: previous.total + 1 };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    });
  }, [phase, pick, runtime, setPlaying, params]);

  const ready = models.slotsReady && (models.status === "trained" || models.status === "pretrained");

  const start = (choice: "nn" | "pinn") => {
    if (!ready) return;
    setPick(choice);
    setReveal(null);
    setPhase("running");
    setSpeed(1);
    setPlaying(true);
    runtime.reset();
  };

  return (
    <SpotlightCard className="p-5" tint="251 146 60">
      <h2 className="text-sm font-semibold tracking-tight text-white">Challenge the AI</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Set a pose, pick a model, and see who is closer to the physics tip at t = 3 s.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAngles((Math.random() * 280 - 140), (Math.random() * 280 - 140))}
        >
          Random pose
        </Button>
        {!ready && (
          <Button size="sm" disabled={models.status === "training"} onClick={models.quickTrain}>
            Quick train (≤5 s)
          </Button>
        )}
      </div>
      {ready && phase !== "running" && (
        <div className="mt-3 grid gap-2">
          <Button size="sm" variant="outline" onClick={() => start("nn")}>
            Standard NN will be closer
          </Button>
          <Button size="sm" variant="outline" onClick={() => start("pinn")}>
            PINN will be closer
          </Button>
        </div>
      )}
      {phase === "running" && (
        <p className="mt-3 font-num text-lg text-white">
          t = <span ref={clockRef}>0.00</span> s
        </p>
      )}
      {reveal && (
        <div data-testid="challenge-reveal" className="mt-3 text-xs leading-relaxed text-white/80">
          <p>Standard NN tip error {reveal.nn.toFixed(3)} m</p>
          <p>PINN tip error {reveal.pinn.toFixed(3)} m</p>
          <p className="mt-1 text-white">{reveal.verdict}</p>
        </div>
      )}
      <p className="mt-3 font-num text-[11px] tracking-wide text-white/50 uppercase">
        Score {score.correct}/{score.total}
      </p>
    </SpotlightCard>
  );
}
