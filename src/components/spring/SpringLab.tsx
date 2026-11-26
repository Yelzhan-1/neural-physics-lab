"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_SPRING, type SpringParams } from "@/engine";
import { SLOTS } from "@/components/scene/runtime";
import { ParamSlider } from "@/components/lab/ControlPanel";
import { Instrument, PlayButton, TrainButton } from "@/components/lab/Instrument";
import { driftText, LiveSparks } from "@/components/lab/LiveSparks";
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
  const timeRef = useRef<HTMLSpanElement>(null);
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
      const stacked = w < 700;
      context.strokeStyle = "rgba(237,230,218,0.10)";
      context.lineWidth = 1;
      context.beginPath();
      if (stacked) {
        context.moveTo(12, h / 3);
        context.lineTo(w - 12, h / 3);
        context.moveTo(12, (2 * h) / 3);
        context.lineTo(w - 12, (2 * h) / 3);
      } else {
        context.moveTo(w / 3, 12);
        context.lineTo(w / 3, h - 12);
        context.moveTo((2 * w) / 3, 12);
        context.lineTo((2 * w) / 3, h - 12);
      }
      context.stroke();
      LANES.forEach((lane, index) => {
        const left = stacked ? 0 : (w / 3) * index;
        const top = stacked ? (h / 3) * index : 0;
        const laneW = stacked ? w : w / 3;
        const laneH = stacked ? h / 3 : h;
        const mid = top + laneH * 0.46;
        const wall = left + 22;
        const rest = left + laneW * 0.42;
        const scale = Math.min(100, laneW * 0.2);
        const x = runtime.states[index][0];
        const massX = Math.min(left + laneW - 28, rest + x * scale);
        context.strokeStyle = "rgba(237,230,218,0.28)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(wall, top + 18);
        context.lineTo(wall, top + laneH - 36);
        context.stroke();
        context.strokeStyle = lane.color;
        context.lineWidth = 1.6;
        context.beginPath();
        context.moveTo(wall, mid);
        const coils = 12;
        const span = Math.max(12, massX - 16 - wall);
        for (let coil = 0; coil <= coils; coil++) {
          const px = wall + (span * coil) / coils;
          const py = coil === 0 || coil === coils ? mid : mid + (coil % 2 === 0 ? 7 : -7);
          context.lineTo(px, py);
        }
        context.stroke();
        context.fillStyle = lane.color;
        context.globalAlpha = runtime.active[index] ? 0.95 : 0.35;
        context.beginPath();
        context.roundRect(massX - 16, mid - 14, 32, 28, 4);
        context.fill();
        context.globalAlpha = 1;
        drawLaneLabel(context, lane.label, lane.color, left + laneW / 2, top + laneH - 16);
      });
    };
    const loop = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      runtime.tick(elapsed);
      draw();
      if (timeRef.current) timeRef.current.textContent = runtime.time.toFixed(2);
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
    <Instrument
      title="Spring-mass"
      active="spring-mass"
      controls={
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The PINN residual is m x″ + c x′ + k x − A sin(ω t).
          </p>
          <ParamSlider symbol="x" name="Release" unit="m" value={release} min={-1.2} max={1.2} step={0.01} digits={2} onChange={onRelease} />
          <ParamSlider symbol="k" name="Stiffness" unit="N/m" value={params.k} min={0.5} max={12} step={0.1} digits={1} onChange={(k) => onParams({ ...params, k })} />
          <ParamSlider symbol="c" name="Damping" unit="N·s/m" value={params.c} min={0} max={2} step={0.01} digits={2} onChange={(c) => onParams({ ...params, c })} />
          <ParamSlider symbol="m" name="Mass" unit="kg" value={params.m} min={0.2} max={5} step={0.1} digits={1} onChange={(m) => onParams({ ...params, m })} />
          <div className="h-16">
            <LossChart nn={nnLoss} pinn={pinnLoss} />
          </div>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          {error && <p className="text-xs text-red-300">{error}</p>}
        </>
      }
      stage={
        <canvas
          ref={canvasRef}
          data-testid="spring-scene"
          className="absolute inset-0 block h-full w-full"
          role="img"
          aria-label="Three spring-mass oscillators: physics, standard NN, and PINN"
        />
      }
      timeline={
        <>
          <PlayButton playing={playing} onClick={() => setPlaying((value) => !value)} />
          <button type="button" onClick={() => runtime.reset()} className="text-xs text-muted-foreground">
            Reset
          </button>
          <span className="ml-auto font-num text-[11px] text-foreground">
            <span ref={timeRef}>0.00</span> s
          </span>
        </>
      }
      metrics={
        <>
          <p data-testid="train-status" className="sr-only">
            {status}
          </p>
          <LiveSparks
            aLabel="Position error"
            bLabel="Energy drift"
            formatB={driftText}
            sample={() => {
              const origin = runtime.states[0][0];
              const energy = runtime.energy(0);
              const miss = (slot: number) =>
                runtime.active[slot] ? Math.abs(runtime.states[slot][0] - origin) : Number.NaN;
              const drift = (slot: number) =>
                runtime.active[slot] && Math.abs(energy) > 1e-9
                  ? Math.abs(runtime.energy(slot) - energy) / Math.abs(energy)
                  : Number.NaN;
              return { aNn: miss(1), aPinn: miss(2), bNn: drift(1), bPinn: drift(2) };
            }}
          />
          <TrainButton disabled={status === "training"} onClick={train}>
            {status === "training" ? "Training…" : "Live train (~20 s)"}
          </TrainButton>
          <p className="text-center font-num text-[11px] text-muted-foreground">
            {status === "training" ? progress || "Training…" : badge ?? "Ready to train"}
          </p>
        </>
      }
    />
  );
}

function drawLaneLabel(
  context: CanvasRenderingContext2D,
  label: string,
  color: string,
  x: number,
  y: number,
) {
  context.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  context.textAlign = "left";
  context.textBaseline = "middle";
  const textWidth = context.measureText(label).width;
  const start = x - (6 + 8 + textWidth) / 2;
  context.fillStyle = color;
  context.beginPath();
  context.arc(start + 3, y, 3, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(237,230,218,0.82)";
  context.fillText(label, start + 14, y);
}
