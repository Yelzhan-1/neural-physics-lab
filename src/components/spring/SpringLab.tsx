"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_SPRING, type SpringParams } from "@/engine";
import { SLOTS } from "@/components/scene/runtime";
import { SpotlightCard } from "@/components/site/SpotlightCard";
import { SystemSelector } from "@/components/systems/SystemSelector";
import { Button } from "@/components/ui/button";
import { ParamSlider } from "@/components/lab/ControlPanel";
import { LossChart } from "@/components/lab/LossChart";
import { MlClient } from "@/ml/client";
import { SEED, SPRING_LIVE_STEPS } from "@/ml/constants";
import { SpringRuntime } from "./runtime";

const RELEASE = 0.65;
const ROLLOUT_URL = "/models/spring-mass/demo-rollout.json";

interface CacheFile {
  dt: number;
  release: number;
  stepsTrained: number;
  nn: number[];
  pinn: number[];
}

const LANES = [
  { label: "Physics (RK4)", color: SLOTS[0].color },
  { label: "Standard NN", color: SLOTS[1].color },
  { label: "PINN", color: SLOTS[2].color },
];

function sameSpring(a: SpringParams, b: SpringParams): boolean {
  return a.m === b.m && a.k === b.k && a.c === b.c && a.driveAmp === b.driveAmp && a.driveOmega === b.driveOmega;
}

export function SpringLab() {
  const [runtime] = useState(() => new SpringRuntime());
  const [params, setParams] = useState<SpringParams>({ ...DEFAULT_SPRING });
  const [release, setRelease] = useState(RELEASE);
  const [playing, setPlaying] = useState(true);
  const [status, setStatus] = useState("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nnLoss, setNnLoss] = useState<number[]>([]);
  const [pinnLoss, setPinnLoss] = useState<number[]>([]);
  const [progress, setProgress] = useState<string>("");
  const [badge, setBadge] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<MlClient | null>(null);
  const cacheRef = useRef<CacheFile | null>(null);
  const paramsRef = useRef(params);
  const releaseRef = useRef(release);
  const trained = useRef<SpringParams | null>(null);
  const workerReady = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    paramsRef.current = params;
    releaseRef.current = release;
  }, [params, release]);
  useEffect(() => runtime.setParams(params), [runtime, params]);
  useEffect(() => runtime.setRelease(release), [runtime, release]);
  useEffect(() => runtime.setPlaying(playing), [runtime, playing]);
  useEffect(() => () => clientRef.current?.terminate(), []);

  const applyCache = (data: CacheFile) => {
    cacheRef.current = data;
    if (!sameSpring(paramsRef.current, DEFAULT_SPRING) || Math.abs(releaseRef.current - data.release) > 0.02) return;
    runtime.setTrajectories(
      { states: Float32Array.from(data.nn), dt: data.dt },
      { states: Float32Array.from(data.pinn), dt: data.dt },
    );
    trained.current = { ...DEFAULT_SPRING };
    setStatus("pretrained");
    setBadge(`Pretrained · ${data.stepsTrained} steps`);
    setError(null);
  };

  useEffect(() => {
    let cancelled = false;
    void fetch(ROLLOUT_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Spring weights are not on this page yet");
        return response.json() as Promise<CacheFile>;
      })
      .then((data) => {
        if (!cancelled) applyCache(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setNote(reason instanceof Error ? reason.message : "Pretrained spring failed to load");
      });
    return () => {
      cancelled = true;
    };
    // The cache is applied once; later pose changes go through the worker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let last = performance.now();
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width;
      const h = rect.height;
      context.clearRect(0, 0, w, h);
      const laneH = h / 3;
      LANES.forEach((lane, index) => {
        const top = index * laneH;
        const mid = top + laneH * 0.55;
        const wall = 28;
        const rest = w * 0.38;
        const scale = Math.min(120, w * 0.16);
        const x = runtime.states[index][0];
        const massX = rest + x * scale;
        context.strokeStyle = "rgba(255,255,255,0.18)";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(wall, top + 16);
        context.lineTo(wall, top + laneH - 16);
        context.stroke();
        context.strokeStyle = lane.color;
        context.lineWidth = 1.6;
        context.beginPath();
        context.moveTo(wall, mid);
        const coils = 14;
        const span = Math.max(12, massX - 18 - wall);
        for (let coil = 0; coil <= coils; coil++) {
          const px = wall + (span * coil) / coils;
          const py = coil === 0 || coil === coils ? mid : mid + (coil % 2 === 0 ? 8 : -8);
          context.lineTo(px, py);
        }
        context.stroke();
        context.fillStyle = lane.color;
        context.globalAlpha = runtime.active[index] ? 0.95 : 0.35;
        context.beginPath();
        context.roundRect(massX - 18, mid - 16, 36, 32, 6);
        context.fill();
        context.globalAlpha = 1;
        context.fillStyle = "rgba(255,255,255,0.72)";
        context.font = "12px sans-serif";
        context.fillText(lane.label, wall + 12, top + 18);
        if (runtime.active[index]) {
          context.fillStyle = "rgba(255,255,255,0.45)";
          context.fillText(`${runtime.energy(index).toFixed(3)} J`, w - 72, top + 18);
        }
      });
    };
    const loop = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      runtime.tick(elapsed);
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [runtime]);

  const ensure = () => {
    if (!clientRef.current) clientRef.current = new MlClient();
    return clientRef.current;
  };

  const onRelease = (value: number) => {
    setRelease(value);
    const current = paramsRef.current;
    const cache = cacheRef.current;
    if (!trained.current || !sameSpring(trained.current, current)) {
      if (cache && sameSpring(current, DEFAULT_SPRING) && Math.abs(value - cache.release) <= 0.02) applyCache(cache);
      return;
    }
    const token = ++generation.current;
    const client = ensure();
    const ready = workerReady.current
      ? Promise.resolve()
      : client.loadSpring().then(() => {
          workerReady.current = true;
        });
    void ready
      .then(() => client.rolloutSpring([value, 0], 12, current))
      .then((rollout) => {
        if (token !== generation.current) return;
        runtime.setTrajectories(
          { states: rollout.nn, dt: rollout.dt },
          { states: rollout.pinn, dt: rollout.dt },
        );
      })
      .catch(() => {});
  };

  const onParams = (next: SpringParams) => {
    setParams(next);
    generation.current += 1;
    const cache = cacheRef.current;
    if (trained.current && sameSpring(trained.current, next)) return;
    if (cache && sameSpring(next, DEFAULT_SPRING)) {
      applyCache(cache);
      return;
    }
    runtime.setTrajectories(null, null);
    setBadge(null);
    setStatus((current) => (current === "training" ? current : "idle"));
  };

  const train = () => {
    const client = ensure();
    const current = { ...paramsRef.current };
    setStatus("training");
    setBadge(null);
    setError(null);
    setNote(null);
    setNnLoss([]);
    setPinnLoss([]);
    runtime.setTrajectories(null, null);
    const nn: number[] = [];
    const pinn: number[] = [];
    void client
      .trainSpring({ fraction: 0.2, lambda: 0.4, params: current, seed: SEED, steps: SPRING_LIVE_STEPS }, (update) => {
        const series = update.model === "nn" ? nn : pinn;
        series[update.step - 1] = update.dataLoss;
        if (update.step % 4 === 0 || update.step === update.steps) {
          setNnLoss(nn.slice());
          setPinnLoss(pinn.slice());
          setProgress(`${update.model === "nn" ? "NN" : "PINN"} ${update.step}/${update.steps}`);
        }
      })
      .then(async (summary) => {
        if (!sameSpring(summary.params, paramsRef.current)) {
          setStatus("idle");
          setNote("Parameters changed during training. Train again.");
          return;
        }
        const rollout = await client.rolloutSpring([releaseRef.current, 0], 12, summary.params);
        trained.current = summary.params;
        workerReady.current = true;
        runtime.setTrajectories(
          { states: rollout.nn, dt: rollout.dt },
          { states: rollout.pinn, dt: rollout.dt },
        );
        setStatus("trained");
        setBadge(null);
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : "Training failed";
        if (message === "cancelled") return;
        setStatus("idle");
        setError(message);
      });
  };

  return (
    <main className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 px-4 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <SystemSelector active="spring-mass" className="mb-4" />
        <SpotlightCard className="overflow-hidden">
          <div className="h-[480px]">
            <canvas
              ref={canvasRef}
              data-testid="spring-scene"
              className="block h-full w-full"
              role="img"
              aria-label="Three spring-mass oscillators: physics, standard NN, and PINN"
            />
          </div>
          <div className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-3">
            <Button size="sm" onClick={() => setPlaying((value) => !value)} className="w-[88px]">
              {playing ? "Pause" : "Play"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => runtime.reset()}>
              Reset
            </Button>
            {badge && <p className="ml-auto text-xs text-white/70">{badge}</p>}
          </div>
        </SpotlightCard>
      </div>
      <div className="grid content-start gap-4">
        <SpotlightCard className="p-5" tint="167 139 250">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Train models</h2>
            <p data-testid="train-status" className="font-num text-[11px] tracking-wide text-white/55 uppercase">
              {status}
            </p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Same 20% of the trajectories, same initial weights. The PINN residual is m x″ + c x′ + k x − A sin(ω t).
          </p>
          <Button className="mt-4 h-10 w-full font-semibold" disabled={status === "training"} onClick={train}>
            {status === "training" ? "Training…" : "Train models"}
          </Button>
          <p className="mt-2 font-num text-xs text-white/55">{progress || "data loss"}</p>
          <div className="mt-3 h-24 overflow-hidden rounded-lg bg-black/25">
            <LossChart nn={nnLoss} pinn={pinnLoss} />
          </div>
          {note && <p className="mt-3 text-xs text-white/70">{note}</p>}
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        </SpotlightCard>
        <SpotlightCard className="grid gap-4 p-5">
          <ParamSlider symbol="x" name="Release" unit="m" value={release} min={-1.2} max={1.2} step={0.01} digits={2} onChange={onRelease} />
          <ParamSlider symbol="k" name="Stiffness" unit="N/m" value={params.k} min={0.5} max={12} step={0.1} digits={1} onChange={(k) => onParams({ ...params, k })} />
          <ParamSlider symbol="c" name="Damping" unit="N·s/m" value={params.c} min={0} max={2} step={0.01} digits={2} onChange={(c) => onParams({ ...params, c })} />
          <ParamSlider symbol="m" name="Mass" unit="kg" value={params.m} min={0.2} max={5} step={0.1} digits={1} onChange={(m) => onParams({ ...params, m })} />
        </SpotlightCard>
      </div>
    </main>
  );
}
