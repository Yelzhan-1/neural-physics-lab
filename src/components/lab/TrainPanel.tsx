"use client";

import { Button } from "@/components/ui/button";
import { formatMetric } from "@/ml/results";
import { LossChart } from "./LossChart";
import { ParamSlider } from "./ControlPanel";
import type { LabModels } from "./useLabModels";

/** Secondary training controls. The primary Live train button lives in the metrics column. */
export function TrainPanel({
  models,
  onUsePretrained,
  percent,
  lambda,
  setLambda,
}: {
  models: LabModels;
  onUsePretrained?: () => void;
  percent: number;
  lambda: number;
  setLambda: (value: number) => void;
}) {
  const { status, progress, summary } = models;
  const busy = status === "training" || status === "loading";

  return (
    <div data-testid="train-panel" className="grid gap-2">
      <p data-testid="train-status" className="sr-only">
        {status}
      </p>
      <Button variant="outline" disabled={busy} onClick={onUsePretrained ?? models.usePretrained}>
        Use pretrained
      </Button>
      <Button variant="outline" disabled={busy} onClick={models.quickTrain}>
        Quick train (≤5 s)
      </Button>
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Advanced · physics weight λ</summary>
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
      <Button variant="ghost" disabled={busy} onClick={() => models.train(percent / 100, lambda)}>
        Train your own
      </Button>
      <div className="h-16 overflow-hidden">
        <LossChart nn={models.nnLoss} pinn={models.pinnLoss} />
      </div>
      <p className="font-num text-[10px] text-muted-foreground">
        {progress
          ? `${progress.model === "nn" ? "NN" : "PINN"} ${progress.step}/${progress.steps}`
          : "data loss"}
      </p>
      {summary && status === "trained" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {summary.trainPairs} of {summary.basePairs} pairs · λ {summary.lambda.toFixed(2)} · final data loss NN{" "}
          {formatMetric(summary.nnLoss)}, PINN {formatMetric(summary.pinnLoss)}
          {models.backend ? ` · ${models.backend}` : ""}.
        </p>
      )}
      {models.note && <p className="text-xs text-muted-foreground">{models.note}</p>}
      {models.error && <p className="text-xs text-red-300">{models.error}</p>}
    </div>
  );
}
