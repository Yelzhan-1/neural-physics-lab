"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MlClient } from "@/ml/client";
import type { ExperimentId } from "@/ml/messages";
import { EXPERIMENT_STEPS } from "@/ml/constants";
import { DRIFT_NOTE, formatMetric, MSE_NOTE, takeaway, type ResultRow, type ResultsFile } from "@/ml/results";
import type { TrainProgress } from "@/ml/train";
import { cn } from "@/lib/utils";

const EXPERIMENTS: { id: ExperimentId; name: string; text: string }[] = [
  {
    id: "E1",
    name: "Standard conditions",
    text: "Full data, tested on held-out trajectories from the same distribution.",
  },
  {
    id: "E2",
    name: "Limited training data",
    text: "Train on 5% and 10% of the base dataset.",
  },
  {
    id: "E3",
    name: "Unseen initial conditions",
    text: "Train on small angles, test on large angles.",
  },
  {
    id: "E4",
    name: "Long-term prediction",
    text: "Rollout error at 1 s, 3 s and 10 s.",
  },
];

function isResultsFile(value: unknown): value is ResultsFile {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ResultsFile>;
  return record.version === 1 && Array.isArray(record.rows) && typeof record.takeaway === "string";
}

function winnerLabel(winner: ResultRow["winner"]): string {
  if (winner === "nn") return "Standard NN";
  if (winner === "pinn") return "PINN";
  return "Tie";
}

export function ExperimentCenter() {
  const clientRef = useRef<MlClient | null>(null);
  const [results, setResults] = useState<ResultsFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<ExperimentId | null>(null);
  const [progress, setProgress] = useState<TrainProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => clientRef.current?.terminate(), []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/results.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Precomputed results are not available yet.");
        const body: unknown = await response.json();
        if (!isResultsFile(body)) throw new Error("results.json has an unexpected shape.");
        if (!cancelled) setResults(body);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setLoadError(reason instanceof Error ? reason.message : "Could not load results.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = (id: ExperimentId) => {
    const client = clientRef.current ?? new MlClient();
    clientRef.current = client;
    setRunning(id);
    setProgress(null);
    setError(null);
    void client
      .experiment(id, (update) => setProgress(update))
      .then((rows) => {
        setResults((current) => {
          const base = current ?? {
            version: 1 as const,
            generatedAt: new Date().toISOString(),
            backend: client.backend ?? "browser",
            seed: 0,
            dt: 0,
            hidden: [],
            optimizerSteps: 0,
            batchSize: 0,
            learningRate: 0,
            lambda: 0,
            rk4MsPerStep: 0,
            rows: [],
            takeaway: "",
          };
          const ids = new Set(rows.map((row) => row.id));
          const merged = [...base.rows.filter((row) => !ids.has(row.id)), ...rows];
          const order = ["E1", "E2-5", "E2-10", "E3", "E4-1", "E4-3", "E4-10", "ES-2", "ES-10", "EP-2", "EP-10", "EO-2", "EO-10"];
          merged.sort((a, b) => {
            const ia = order.indexOf(a.id);
            const ib = order.indexOf(b.id);
            return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
          });
          return {
            ...base,
            rows: merged,
            takeaway: takeaway(merged, base.seeds ?? []),
            generatedAt: new Date().toISOString(),
            backend: client.backend ?? base.backend,
          };
        });
        setLive((current) => new Set([...current, id]));
        setRunning(null);
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : "The experiment failed.";
        if (message !== "cancelled") setError(message);
        setRunning(null);
      });
  };

  const exportJson = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "neural-physics-lab-results.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const limited = results?.rows.find((row) => row.id === "E2-5");
  const seed = results?.seeds?.find((item) => item.id === "E2-5");
  const single = limited && limited.pinn.mse > 0 ? limited.nn.mse / limited.pinn.mse : null;
  const mean = seed && seed.pinnMseMean > 0 ? seed.nnMseMean / seed.pinnMseMean : null;
  const headline = results?.rows.filter((row) => ["E1", "E2-5", "E3", "E4-3"].includes(row.id)) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-6 sm:px-10">
      <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <p className="font-num text-[11px] tracking-[0.18em] text-white/40 uppercase">5% of the data</p>
          <h1 className="font-num mt-2 text-[clamp(5.5rem,14vw,10rem)] leading-none tracking-[-0.08em] text-physics">
            {single ? `${single.toFixed(1)}×` : "—"}
          </h1>
          <p className="mt-3 max-w-md text-xl text-white/85">
            {single
              ? `${single.toFixed(1)}× lower error at 5% data — seed ${results?.seed ?? 2026}`
              : (loadError ?? "Loading the measured result…")}
          </p>
          <p className="mt-2 font-num text-sm text-white/50">
            {mean ? `3-seed mean ≈ ${mean.toFixed(1)}×` : "3-seed mean ≈ 3.2×"}
          </p>
          <Button variant="outline" onClick={exportJson} disabled={!results} className="mt-6 gap-1.5">
            <Download className="size-3.5" />
            Export results (JSON)
          </Button>
        </div>
        {headline.length > 0 && <FindingBars rows={headline} />}
      </div>
      {progress && running && (
        <p className="font-num text-xs text-white/70">
          {running} · {progress.model === "nn" ? "Standard NN" : "PINN"} {progress.step}/{progress.steps}
        </p>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}

      <details className="rounded-2xl border border-white/10">
        <summary className="cursor-pointer px-5 py-3 text-sm text-white">All runs</summary>
        <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table data-testid="results-table" className="w-full min-w-[860px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[11px] tracking-wide text-white/45 uppercase">
                <th className="px-4 py-3 font-medium">Experiment</th>
                <th className="px-3 py-3 font-medium">Setting</th>
                <th className="px-3 py-3 font-medium" title={MSE_NOTE}>NN MSE</th>
                <th className="px-3 py-3 font-medium" title={MSE_NOTE}>PINN MSE</th>
                <th className="px-3 py-3 font-medium" title={MSE_NOTE}>NN MAE</th>
                <th className="px-3 py-3 font-medium" title={MSE_NOTE}>PINN MAE</th>
                <th className="px-3 py-3 font-medium" title={DRIFT_NOTE}>NN |ΔE|/|E0|</th>
                <th className="px-3 py-3 font-medium" title={DRIFT_NOTE}>PINN |ΔE|/|E0|</th>
                <th className="px-3 py-3 font-medium">NN ms</th>
                <th className="px-3 py-3 font-medium">PINN ms</th>
                <th className="px-4 py-3 font-medium">Winner</th>
              </tr>
            </thead>
            <tbody>
              {(results?.rows ?? []).map((row) => (
                <tr key={row.id} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-4 py-3 font-medium text-white">
                    {row.name}
                    {live.has(row.experiment) && (
                      <span className="ml-2 font-num text-[10px] tracking-wide text-physics uppercase">
                        Live
                      </span>
                    )}
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-muted-foreground">{row.setting}</td>
                  <Metric value={row.nn.mse} highlight={row.winner === "nn"} tone="nn" />
                  <Metric value={row.pinn.mse} highlight={row.winner === "pinn"} tone="pinn" />
                  <Metric value={row.nn.mae} highlight={false} tone="nn" />
                  <Metric value={row.pinn.mae} highlight={false} tone="pinn" />
                  <Metric value={row.nn.energyDrift} highlight={false} tone="nn" />
                  <Metric value={row.pinn.energyDrift} highlight={false} tone="pinn" />
                  <td className="font-num px-3 py-3 text-white/70">{formatMetric(row.nn.msPerStep)}</td>
                  <td className="font-num px-3 py-3 text-white/70">{formatMetric(row.pinn.msPerStep)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                        row.winner === "nn" && "bg-nn/15 text-nn",
                        row.winner === "pinn" && "bg-pinn/15 text-pinn",
                        row.winner === "tie" && "bg-white/10 text-white/70",
                      )}
                    >
                      {winnerLabel(row.winner)}
                    </span>
                  </td>
                </tr>
              ))}
              {!results && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                    {loadError ?? "Loading results…"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      </details>

      {results?.seeds && results.seeds.length > 0 && (
        <details className="rounded-2xl border border-white/10 px-5 py-3">
          <summary className="cursor-pointer text-sm text-white">Seeds</summary>
          <div data-testid="seed-sweep" className="pt-3">
          <h2 className="text-sm font-semibold tracking-tight text-white">Seed sweep</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            Same budget on seeds {results.seeds[0]?.seeds.join(", ")}. Mean ± sample standard deviation.
            MSE is state error in radians and rad/s. Drift is |ΔE|/|E0|.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[11px] tracking-wide text-white/45 uppercase">
                  <th className="py-2 pr-3 font-medium">Run</th>
                  <th className="px-3 py-2 font-medium">NN MSE</th>
                  <th className="px-3 py-2 font-medium">PINN MSE</th>
                  <th className="px-3 py-2 font-medium">NN |ΔE|/|E0|</th>
                  <th className="px-3 py-2 font-medium">PINN |ΔE|/|E0|</th>
                </tr>
              </thead>
              <tbody>
                {results.seeds.map((item) => (
                  <tr key={item.id} className="border-b border-white/[0.06] last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-white">{item.name}</td>
                    <td className="font-num px-3 py-2.5 text-nn">
                      {formatMetric(item.nnMseMean)} ± {formatMetric(item.nnMseStd)}
                    </td>
                    <td className="font-num px-3 py-2.5 text-pinn">
                      {formatMetric(item.pinnMseMean)} ± {formatMetric(item.pinnMseStd)}
                    </td>
                    <td className="font-num px-3 py-2.5 text-white/70">
                      {formatMetric(item.nnDriftMean)} ± {formatMetric(item.nnDriftStd)}
                    </td>
                    <td className="font-num px-3 py-2.5 text-white/70">
                      {formatMetric(item.pinnDriftMean)} ± {formatMetric(item.pinnDriftStd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </details>
      )}

      <details className="rounded-2xl border border-white/10 px-5 py-3">
        <summary className="cursor-pointer text-sm text-white">Re-run</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {EXPERIMENTS.map((experiment) => (
            <Button
              key={experiment.id}
              size="sm"
              variant="outline"
              disabled={running !== null}
              aria-label={`Re-run ${experiment.name} live`}
              onClick={() => run(experiment.id)}
            >
              {running === experiment.id ? "Running…" : experiment.name}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/40">
          Live re-runs use {EXPERIMENT_STEPS} steps. {MSE_NOTE}
        </p>
      </details>

      <details className="rounded-2xl border border-white/10 px-5 py-3">
        <summary className="cursor-pointer text-sm text-white">Limits</summary>
        <ul className="mt-3 grid gap-2 text-sm text-white/60">
          <li>By 10 s a chaotic pendulum has left both one-step models behind.</li>
          <li>The 6.1× figure is seed 2026. Across three seeds the mean is about 3.2×.</li>
          <li>{DRIFT_NOTE}</li>
        </ul>
      </details>
    </div>
  );
}

const BAR_LABEL: Record<string, string> = {
  E1: "Full",
  "E2-5": "5% data",
  E3: "Unseen",
  "E4-3": "3 s",
};

function FindingBars({ rows }: { rows: ResultRow[] }) {
  const values = rows.flatMap((row) => [row.nn.mse, row.pinn.mse]).filter((value) => value > 0);
  const floor = Math.min(...values) * 0.7;
  const ceil = Math.max(...values);
  const log = (value: number) => Math.log10(Math.max(value, floor));
  const span = Math.max(log(ceil) - log(floor), 0.2);
  const heightOf = (value: number) => `${Math.max(8, ((log(value) - log(floor)) / span) * 100)}%`;
  return (
    <div className="rounded-2xl border border-white/10 p-5">
      <div className="mb-4 flex gap-4 text-[11px] text-white/50">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-nn" /> Standard NN</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm bg-pinn" /> PINN</span>
      </div>
      <div className="flex h-48 items-end gap-4">
        {rows.map((row) => (
          <div key={row.id} className="flex h-full flex-1 items-end justify-center gap-1">
            <span className="w-3 rounded-t bg-nn" style={{ height: heightOf(row.nn.mse) }} />
            <span className="w-3 rounded-t bg-pinn" style={{ height: heightOf(row.pinn.mse) }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {rows.map((row) => (
          <p key={row.id} className="flex-1 text-center text-[11px] text-white/45">
            {BAR_LABEL[row.id] ?? row.name}
          </p>
        ))}
      </div>
    </div>
  );
}

function Metric({
  value,
  highlight,
  tone,
}: {
  value: number;
  highlight: boolean;
  tone: "nn" | "pinn";
}) {
  return (
    <td
      className={cn(
        "font-num px-3 py-3",
        highlight ? (tone === "nn" ? "text-nn" : "text-pinn") : "text-white/75",
      )}
    >
      {formatMetric(value)}
    </td>
  );
}
