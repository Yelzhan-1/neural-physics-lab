"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_SPRING, type SpringParams } from "@/engine";
import { SLOTS, type SlotId } from "@/components/scene/runtime";
import { ParamSlider } from "@/components/lab/ControlPanel";
import { FractionRow, Instrument, ModelToggles, PlayButton, TrainButton } from "@/components/lab/Instrument";
import { laneFrames, NARROW_MQ, paintLane, strokeLaneDividers, type LaneFrame } from "@/components/lab/lanes";
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
  const [percent, setPercent] = useState(20);
  const [shown, setShown] = useState<Record<SlotId, boolean>>({ physics: true, nn: true, pinn: true });
  const [status, setStatus] = useState("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nnLoss, setNnLoss] = useState<number[]>([]);
  const [pinnLoss, setPinnLoss] = useState<number[]>([]);
  const [progress, setProgress] = useState<string>("");
  const [badge, setBadge] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const dockTimeRef = useRef<HTMLSpanElement>(null);
  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
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
      const stacked = window.matchMedia(NARROW_MQ).matches;
      const lanes = LANES.map((lane, index) => ({ lane, index })).filter((item) => shownRef.current[SLOTS[item.index].id]);
      const visible = lanes.length > 0 ? lanes : [{ lane: LANES[0], index: 0 }];
      strokeLaneDividers(context, visible.length, w, h, stacked);
      const frames = laneFrames(visible.length, w, h, stacked);
      const fit = sharedSpringScale(frames, runtime);
      visible.forEach(({ lane, index }, order) => {
        const frame = frames[order];
        if (!frame) return;
        paintLane(context, frame, () => {
          drawSpringLane(context, runtime, index, lane.color, frame, fit.scale, fit.restOffset);
        });
        drawLaneLabel(context, lane.label, lane.color, frame.left + frame.width / 2, frame.top + frame.height - 16);
      });
    };
    const loop = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      runtime.tick(elapsed);
      draw();
      const clock = runtime.time.toFixed(2);
      if (timeRef.current) timeRef.current.textContent = clock;
      if (dockTimeRef.current) dockTimeRef.current.textContent = clock;
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
      .trainSpring({ fraction: Math.min(1, Math.max(0.05, percent / 100)), lambda: 0.4, params: current, seed: SEED, steps: SPRING_LIVE_STEPS }, (update) => {
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

  const usePretrained = () => {
    const cache = cacheRef.current;
    paramsRef.current = { ...DEFAULT_SPRING };
    releaseRef.current = cache?.release ?? RELEASE;
    setParams({ ...DEFAULT_SPRING });
    setRelease(cache?.release ?? RELEASE);
    if (cache) applyCache(cache);
  };

  return (
    <Instrument
      title="Spring-mass"
      active="spring-mass"
      controls={
        <>
          <ModelToggles
            shown={shown}
            onChange={(id, checked) => setShown((current) => ({ ...current, [id]: checked }))}
          />
          <FractionRow value={percent} onChange={setPercent} />
          <ParamSlider symbol="x" name="Release" unit="m" value={release} min={-1.2} max={1.2} step={0.01} digits={2} onChange={onRelease} />
          <ParamSlider symbol="k" name="Stiffness" unit="N/m" value={params.k} min={0.5} max={12} step={0.1} digits={1} onChange={(k) => onParams({ ...params, k })} />
          <ParamSlider symbol="c" name="Damping" unit="N·s/m" value={params.c} min={0} max={2} step={0.01} digits={2} onChange={(c) => onParams({ ...params, c })} />
          <ParamSlider symbol="m" name="Mass" unit="kg" value={params.m} min={0.2} max={5} step={0.1} digits={1} onChange={(m) => onParams({ ...params, m })} />
          <button
            type="button"
            disabled={status === "training"}
            onClick={usePretrained}
            className="h-8 rounded-[6px] border border-hairline px-3 text-left font-num text-[11px] tracking-[0.12em] text-foreground uppercase disabled:opacity-40"
          >
            Use pretrained
          </button>
          {(nnLoss.length > 0 || pinnLoss.length > 0) && (
            <div className="h-16">
              <LossChart nn={nnLoss} pinn={pinnLoss} />
            </div>
          )}
          <details className="border-t border-hairline pt-3">
            <summary className="cursor-pointer font-num text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              More
            </summary>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              The PINN residual is m x″ + c x′ + k x − A sin(ω t).
            </p>
            {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          </details>
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
            logB
            smooth
            sample={() => {
              const origin = runtime.states[0][0];
              const energy = runtime.energy(0);
              const miss = (slot: number) =>
                runtime.active[slot] ? Math.abs(runtime.states[slot][0] - origin) : Number.NaN;
              const drift = (slot: number) =>
                runtime.active[slot] && Math.abs(energy) > 1e-9
                  ? Math.abs(runtime.energy(slot) - energy) / Math.abs(energy)
                  : Number.NaN;
              return { t: runtime.time, aNn: miss(1), aPinn: miss(2), bNn: drift(1), bPinn: drift(2) };
            }}
          />
          <TrainButton className="max-lg:hidden" disabled={status === "training"} onClick={train}>
            {status === "training" ? "Training…" : "Live train (~20 s)"}
          </TrainButton>
          <p className="text-center font-num text-[10px] text-balance text-muted-foreground">
            {status === "training" ? progress || "Training…" : badge ?? "Ready to train"}
          </p>
        </>
      }
      dock={
        <>
          <span className="font-num w-16 shrink-0 text-[11px] text-foreground">
            <span ref={dockTimeRef}>0.00</span> s
          </span>
          <TrainButton className="mt-0" disabled={status === "training"} onClick={train}>
            {status === "training" ? "Training…" : "Live train (~20 s)"}
          </TrainButton>
        </>
      }
    />
  );
}

function sharedSpringScale(frames: LaneFrame[], runtime: SpringRuntime): { scale: number; restOffset: number } {
  let peak = 0.35;
  for (let slot = 0; slot < 3; slot++) peak = Math.max(peak, Math.abs(runtime.states[slot][0]));
  let minW = Infinity;
  for (const frame of frames) minW = Math.min(minW, frame.width);
  if (!Number.isFinite(minW)) minW = 160;
  const restOffset = minW * 0.42;
  const room = Math.min(Math.max(12, restOffset - 32), Math.max(12, minW - 36 - restOffset));
  return { scale: room / peak, restOffset };
}

function drawSpringLane(
  context: CanvasRenderingContext2D,
  runtime: SpringRuntime,
  index: number,
  color: string,
  frame: LaneFrame,
  scale: number,
  restOffset: number,
) {
  const { left, top, height } = frame;
  const mid = top + height * 0.5;
  const wall = left + 22;
  const rest = left + restOffset;
  const massX = rest + runtime.states[index][0] * scale;
  context.strokeStyle = "rgba(237,230,218,0.28)";
  context.lineWidth = 2;
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(wall, top + 18);
  context.lineTo(wall, top + height - 36);
  context.stroke();
  context.strokeStyle = color;
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
  context.fillStyle = color;
  context.globalAlpha = runtime.active[index] ? 0.95 : 0.35;
  context.beginPath();
  context.roundRect(massX - 16, mid - 14, 32, 28, 4);
  context.fill();
  context.globalAlpha = 1;
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
