"use client";

import { useState } from "react";
import { SpotlightCard } from "@/components/site/SpotlightCard";
import { Button } from "@/components/ui/button";
import { DATA_FRACTIONS, DEFAULT_LAMBDA } from "@/ml/constants";
import { formatMetric } from "@/ml/results";
import { LossChart } from "./LossChart";
import { ParamSlider } from "./ControlPanel";
import type { LabModels } from "./useLabModels";

const SIZES = DATA_FRACTIONS;

function nearestSize(value: number): number {
  return SIZES.reduce((best, size) => (Math.abs(size - value) < Math.abs(best - size) ? size : best));
}

export function TrainPanel({
  models,
  onUsePretrained,
}: {
  models: LabModels;
  onUsePretrained?: () => void;
}) {
  const [percent, setPercent] = useState(20);
  const [lambda, setLambda] = useState(DEFAULT_LAMBDA);
  const { status, progress, summary } = models;
  const busy = status === "training" || status === "loading";
  const etaLabel =
    models.phase === "calibrating"
      ? "Calibrating…"
      : models.phase === "training" && models.etaSeconds != null
        ? `Training… ${Math.max(0, Math.ceil(models.etaSeconds))} s left`
        : status === "pretrained"
          ? `Pretrained · ${models.pretrainedSteps} steps`
          : null;

  return (
    <SpotlightCard className="p-5 sm:p-6" tint="167 139 250">
      <div data-testid="train-panel">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-white">Train models</h2>
          <p data-testid="train-status" className="font-num text-[11px] tracking-wide text-white/55 uppercase">
            {status}
          </p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Same data, same initial weights. The PINN adds λ times the equations of motion, including
          states that have no label.
        </p>

        <div className="mt-5">
          <ParamSlider
            symbol="%"
            name="Training data"
            ariaLabel="Training data size"
            unit="%"
            value={percent}
            min={SIZES[0]}
            max={SIZES[SIZES.length - 1]}
            step={1}
            digits={0}
            onChange={(value) => setPercent(nearestSize(value))}
          />
          <div className="mt-1.5 flex justify-between text-[10px] text-white/35">
            {SIZES.map((size) => (
              <span key={size}>{size}</span>
            ))}
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground select-none">
            Advanced · physics weight λ
          </summary>
          <div className="mt-3">
            <ParamSlider
              symbol="λ"
              name="Lambda"
              ariaLabel="Physics loss weight"
              unit=""
              value={lambda}
              min={0}
              max={2}
              step={0.05}
              digits={2}
              onChange={setLambda}
            />
          </div>
        </details>

        <Button
          className="mt-5 h-10 w-full text-sm font-semibold shadow-[0_0_24px_-8px_var(--pinn)]"
          disabled={busy}
          onClick={models.liveTrain}
        >
          Live train (~20 s)
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={onUsePretrained ?? models.usePretrained}
          >
            Use pretrained
          </Button>
          <Button variant="outline" disabled={busy} onClick={models.quickTrain}>
            Quick train (≤5 s)
          </Button>
        </div>
        {etaLabel && (
          <p data-testid="train-eta" className="mt-3 font-num text-lg tracking-tight text-white">
            {etaLabel}
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Live train times a few steps on this device, then picks a step count so both models finish
          in about 16 seconds. The loss curves run live. The rollout is one batched pass, then the
          lab jumps to where the networks split and plays at 2×.
        </p>

        <div className="mt-4 h-24 overflow-hidden rounded-lg bg-black/25 ring-1 ring-white/5">
          <LossChart nn={models.nnLoss} pinn={models.pinnLoss} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-nn" />
            Standard NN
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-pinn" />
            PINN
          </span>
          <span className="text-white/40">smoothed · raw behind</span>
          <span className="ml-auto font-num text-white/70">
            {progress
              ? `${progress.model === "nn" ? "NN" : "PINN"} ${progress.step}/${progress.steps}`
              : "data loss"}
          </span>
        </div>

        <Button
          variant="ghost"
          className="mt-3 w-full"
          disabled={busy}
          onClick={() => models.train(percent / 100, lambda)}
        >
          Train your own
        </Button>

        {summary && status === "trained" && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {summary.trainPairs} of {summary.basePairs} pairs · λ {summary.lambda.toFixed(2)} · final
            data loss NN {formatMetric(summary.nnLoss)}, PINN {formatMetric(summary.pinnLoss)}
            {models.backend ? ` · ${models.backend}` : ""}.
          </p>
        )}
        {models.note && <p className="mt-3 text-xs text-white/70">{models.note}</p>}
        {models.error && <p className="mt-3 text-xs text-red-300">{models.error}</p>}
      </div>
    </SpotlightCard>
  );
}
