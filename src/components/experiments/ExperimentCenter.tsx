"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { SpotlightCard } from "@/components/site/SpotlightCard";
import { Button } from "@/components/ui/button";
import { SystemSelector } from "@/components/systems/SystemSelector";
import { MlClient } from "@/ml/client";
import type { ExperimentId } from "@/ml/messages";
import { EXPERIMENT_STEPS } from "@/ml/constants";
import { DRIFT_NOTE, formatMetric, MSE_NOTE, takeaway, type ResultRow, type ResultsFile } from "@/ml/results";
import { MseChart } from "./MseChart";
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
          const order = ["E1", "E2-5", "E2-10", "E3", "E4-1", "E4-3", "E4-10"];
          merged.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
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

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 pb-12 sm:px-8">
      <SystemSelector />

      <SpotlightCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-lg font-semibold tracking-tight text-white">Experiment center</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              {results?.takeaway ?? loadError ?? "Loading the precomputed results…"}
            </p>
          </div>
          <Button variant="outline" onClick={exportJson} disabled={!results} className="gap-1.5">
            <Download className="size-3.5" />
            Export results (JSON)
          </Button>
        </div>
        {results && (
          <p className="mt-3 text-xs text-muted-foreground">
            {live.size > 0 ? "Includes a live re-run. " : "Precomputed in this build. "}
            Backend {results.backend}
            {results.rk4MsPerStep > 0
              ? ` · RK4 ${formatMetric(results.rk4MsPerStep)} ms per step`
              : ""}
            . {MSE_NOTE} {DRIFT_NOTE} Winner is the lower rollout MSE. A gap under 2% is a tie.
            Live re-runs use {EXPERIMENT_STEPS} steps so the page stays responsive. The loaded
            numbers used {results.optimizerSteps} steps
            {results.learningRateEnd
              ? `, cosine learning rate ${results.learningRate} to ${results.learningRateEnd}`
              : ""}
            .
          </p>
        )}
        {progress && running && (
          <p className="font-num mt-2 text-xs text-white/70">
            {running} · {progress.model === "nn" ? "Standard NN" : "PINN"} {progress.step}/
            {progress.steps} · data loss {formatMetric(progress.dataLoss)}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </SpotlightCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {EXPERIMENTS.map((experiment) => (
          <SpotlightCard key={experiment.id} className="flex h-full flex-col p-4">
            <p className="font-num text-[11px] tracking-[0.14em] text-white/40">{experiment.id}</p>
            <h2 className="mt-2 text-sm font-semibold tracking-tight text-white">{experiment.name}</h2>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{experiment.text}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              disabled={running !== null}
              aria-label={`Re-run ${experiment.name} live`}
              onClick={() => run(experiment.id)}
            >
              {running === experiment.id ? "Running…" : "Re-run live"}
            </Button>
          </SpotlightCard>
        ))}
      </div>

      {results && results.rows.length > 0 && (
        <SpotlightCard className="p-5 sm:p-6">
          <MseChart rows={results.rows} />
        </SpotlightCard>
      )}

      <SpotlightCard className="overflow-hidden">
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
      </SpotlightCard>

      {results?.seeds && results.seeds.length > 0 && (
        <SpotlightCard className="p-5 sm:p-6">
          <div data-testid="seed-sweep">
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
        </SpotlightCard>
      )}

      <SpotlightCard className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold tracking-tight text-white">Limitations and next steps</h2>
        <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-white/65 sm:grid-cols-2">
          <li>A chaotic pendulum leaves any one-step model behind. By 10 s both rollouts have grown, and that is expected.</li>
          <li>The network predicts a single step of 0.02 s and is rolled out by feeding its own output back in, so small errors accumulate.</li>
          <li>One TensorFlow step is far slower than an RK4 step. The gap is call overhead, not a claim that the solver is the product.</li>
          <li>Spring-mass, projectile, and orbital motion are placeholders. The weights belong to the masses and lengths they were trained on.</li>
          <li>Next: a Hamiltonian network or a neural ODE, more physical systems behind the same interface, and training on a trajectory the user records.</li>
        </ul>
      </SpotlightCard>
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
