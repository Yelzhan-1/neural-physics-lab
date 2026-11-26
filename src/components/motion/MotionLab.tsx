"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ORBITAL,
  DEFAULT_PROJECTILE,
  orbitalLaunch,
  orbitalRk4,
  projectileLaunch,
  projectileRk4,
  type OrbitalParams,
  type ProjectileParams,
} from "@/engine";
import { SLOTS } from "@/components/scene/runtime";
import { SpotlightCard } from "@/components/site/SpotlightCard";
import { SystemSelector } from "@/components/systems/SystemSelector";
import { Button } from "@/components/ui/button";
import { ParamSlider } from "@/components/lab/ControlPanel";
import { LossChart } from "@/components/lab/LossChart";
import { MlClient } from "@/ml/client";
import { LIVE_TRAIN_TARGET_MS, SEED } from "@/ml/constants";
import { MotionRuntime } from "./runtime";

type Kind = "projectile" | "orbital";

interface CacheFile {
  dt: number;
  stepsTrained: number;
  launch: number[];
  drag?: number;
  gm?: number;
  nn: number[];
  pinn: number[];
}

const COPY: Record<Kind, { active: string; testId: string; url: string; residual: string; label: string }> = {
  projectile: {
    active: "projectile",
    testId: "projectile-scene",
    url: "/models/projectile/demo-rollout.json",
    residual: "The PINN residual is m a + c |v| v + m g ŷ.",
    label: "Three projectiles: physics, standard NN, and PINN",
  },
  orbital: {
    active: "orbital",
    testId: "orbital-scene",
    url: "/models/orbital/demo-rollout.json",
    residual: "The PINN residual is a + GM r/|r|³, plus energy and angular momentum.",
    label: "Three orbits: physics, standard NN, and PINN",
  },
};

export function ProjectileLab() {
  return <MotionLab kind="projectile" />;
}

export function OrbitalLab() {
  return <MotionLab kind="orbital" />;
}

function MotionLab({ kind }: { kind: Kind }) {
  const copy = COPY[kind];
  const [runtime] = useState(() => new MotionRuntime());
  const [projectile, setProjectile] = useState<ProjectileParams>({ ...DEFAULT_PROJECTILE });
  const [orbital, setOrbital] = useState<OrbitalParams>({ ...DEFAULT_ORBITAL });
  const [playing, setPlaying] = useState(true);
  const [status, setStatus] = useState("idle");
  const [phase, setPhase] = useState<string | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nnLoss, setNnLoss] = useState<number[]>([]);
  const [pinnLoss, setPinnLoss] = useState<number[]>([]);
  const [badge, setBadge] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<MlClient | null>(null);
  const cacheRef = useRef<CacheFile | null>(null);
  const workerReady = useRef(false);
  const generation = useRef(0);
  const projectileRef = useRef(projectile);
  const orbitalRef = useRef(orbital);

  const launch = kind === "projectile" ? Array.from(projectileLaunch(projectile)) : Array.from(orbitalLaunch(orbital));
  const launchKey = launch.join("|");

  useEffect(() => {
    projectileRef.current = projectile;
    orbitalRef.current = orbital;
  }, [projectile, orbital]);

  useEffect(() => {
    runtime.setGround(kind === "projectile");
    runtime.setStep((state, dt) => {
      if (kind === "projectile") projectileRk4(state, projectileRef.current, dt, state);
      else orbitalRk4(state, orbitalRef.current, dt, state);
    });
  }, [kind, runtime]);

  useEffect(() => {
    const next =
      kind === "projectile" ? projectileLaunch(projectileRef.current) : orbitalLaunch(orbitalRef.current);
    runtime.setRelease(next);
  }, [kind, runtime, launchKey]);
  useEffect(() => runtime.setPlaying(playing), [runtime, playing]);
  useEffect(() => () => clientRef.current?.terminate(), []);

  const applyCache = (data: CacheFile) => {
    cacheRef.current = data;
    const current = currentLaunch();
    if (!sameLaunch(current, data.launch) || !cacheMatches(data)) return;
    runtime.setTrajectories(Float32Array.from(data.nn), Float32Array.from(data.pinn), data.dt);
    setStatus("pretrained");
    setBadge(`Pretrained · ${data.stepsTrained} steps`);
    setError(null);
  };

  function currentLaunch(): number[] {
    return kind === "projectile"
      ? Array.from(projectileLaunch(projectileRef.current))
      : Array.from(orbitalLaunch(orbitalRef.current));
  }

  function cacheMatches(data: CacheFile): boolean {
    if (kind === "projectile") return Math.abs((data.drag ?? -1) - projectileRef.current.c) < 1e-6;
    return Math.abs((data.gm ?? -1) - orbitalRef.current.gm) < 1e-6;
  }

  useEffect(() => {
    let cancelled = false;
    void fetch(copy.url)
      .then((response) => {
        if (!response.ok) throw new Error("Pretrained weights are not on this page yet");
        return response.json() as Promise<CacheFile>;
      })
      .then((data) => {
        if (!cancelled) applyCache(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setNote(reason instanceof Error ? reason.message : "Pretrained weights failed to load");
      });
    return () => {
      cancelled = true;
    };
    // Loaded once. Later launches go through the worker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy.url, runtime]);

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
      SLOTS.forEach((slot, index) => {
        const top = index * laneH;
        if (kind === "projectile") drawProjectile(context, runtime, index, slot.color, slot.label, 16, top, w - 32, laneH);
        else drawOrbit(context, runtime, index, slot.color, slot.label, 16, top, w - 32, laneH);
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
  }, [kind, runtime]);

  const ensure = () => {
    if (!clientRef.current) clientRef.current = new MlClient();
    return clientRef.current;
  };

  const showRollout = async (token: number) => {
    const client = ensure();
    if (!workerReady.current) {
      if (kind === "projectile") await client.loadProjectile();
      else await client.loadOrbital();
      workerReady.current = true;
    }
    const initial = currentLaunch();
    const rollout =
      kind === "projectile"
        ? await client.rolloutProjectile(initial, 8, projectileRef.current)
        : await client.rolloutOrbital(initial, 12, orbitalRef.current);
    if (token !== generation.current) return;
    runtime.setTrajectories(rollout.nn, rollout.pinn, rollout.dt);
  };

  const onLaunchChange = () => {
    if (status === "training" || status === "idle" || status === "loading") return;
    const token = ++generation.current;
    void showRollout(token).catch(() => {});
  };

  const liveTrain = () => {
    const client = ensure();
    const token = ++generation.current;
    setStatus("training");
    setPhase("calibrating");
    setEta(null);
    setBadge(null);
    setError(null);
    setNote(null);
    setNnLoss([]);
    setPinnLoss([]);
    const nn: number[] = [];
    const pinn: number[] = [];
    const request = {
      fraction: 1,
      lambda: 0.4,
      seed: SEED,
      calibrate: true,
      targetMs: LIVE_TRAIN_TARGET_MS,
    };
    const watch = (update: { model: "nn" | "pinn"; step: number; dataLoss: number; phase?: string; etaSeconds?: number | null }) => {
      const series = update.model === "nn" ? nn : pinn;
      series[update.step - 1] = update.dataLoss;
      if (update.step % 2 === 0) {
        setNnLoss(nn.slice());
        setPinnLoss(pinn.slice());
        setPhase(update.phase ?? "training");
        setEta(update.etaSeconds ?? null);
      }
    };
    const done = kind === "projectile"
      ? client.trainProjectile({ ...request, params: { ...projectileRef.current } }, watch)
      : client.trainOrbital({ ...request, params: { ...orbitalRef.current } }, watch);
    void done
      .then(async () => {
        if (token !== generation.current) return;
        workerReady.current = true;
        await showRollout(token);
        if (token !== generation.current) return;
        setStatus("trained");
        setPhase(null);
        setEta(null);
        setBadge(null);
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : "Training failed";
        if (message === "cancelled") return;
        setStatus("idle");
        setPhase(null);
        setError(message);
      });
  };

  const usePretrained = () => {
    generation.current += 1;
    if (kind === "projectile") setProjectile({ ...DEFAULT_PROJECTILE });
    else setOrbital({ ...DEFAULT_ORBITAL });
    const cache = cacheRef.current;
    if (cache) {
      projectileRef.current = { ...DEFAULT_PROJECTILE };
      orbitalRef.current = { ...DEFAULT_ORBITAL };
      applyCache(cache);
    }
  };

  const etaLabel =
    phase === "calibrating"
      ? "Calibrating…"
      : phase === "training" && eta != null
        ? `Training… ${Math.max(0, Math.ceil(eta))} s left`
        : badge;

  return (
    <main className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 px-4 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <SystemSelector active={copy.active} className="lg:col-span-2" />
      <div className="min-w-0">
        <SpotlightCard className="overflow-hidden">
          <div className="h-[520px]">
            <canvas
              ref={canvasRef}
              data-testid={copy.testId}
              className="block h-full w-full"
              role="img"
              aria-label={copy.label}
            />
          </div>
          <div className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-3">
            <Button size="sm" onClick={() => setPlaying((value) => !value)} className="w-[88px]">
              {playing ? "Pause" : "Play"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => runtime.reset()}>
              Reset
            </Button>
            {etaLabel && <p className="ml-auto text-xs text-white/70">{etaLabel}</p>}
          </div>
        </SpotlightCard>
      </div>
      <div className="grid content-start gap-4 lg:sticky lg:top-4 lg:self-start">
        <SpotlightCard className="p-5" tint="167 139 250">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Train models</h2>
            <p data-testid="train-status" className="font-num text-[11px] tracking-wide text-white/55 uppercase">
              {status}
            </p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.residual}</p>
          <Button className="mt-4 h-11 w-full font-semibold" disabled={status === "training"} onClick={liveTrain}>
            Live train (~20 s)
          </Button>
          <Button className="mt-2 h-10 w-full" variant="outline" disabled={status === "training"} onClick={usePretrained}>
            Use pretrained
          </Button>
          <div className="mt-3 h-24 overflow-hidden rounded-lg bg-black/25">
            <LossChart nn={nnLoss} pinn={pinnLoss} />
          </div>
          {note && <p className="mt-3 text-xs text-white/70">{note}</p>}
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        </SpotlightCard>
        <SpotlightCard className="grid gap-4 p-5">
          {kind === "projectile" ? (
            <>
              <ParamSlider
                symbol="θ"
                name="Launch angle"
                unit="°"
                value={projectile.angle}
                min={15}
                max={80}
                step={1}
                digits={0}
                onChange={(angle) => {
                  const next = { ...projectile, angle };
                  projectileRef.current = next;
                  setProjectile(next);
                  onLaunchChange();
                }}
              />
              <ParamSlider
                symbol="v"
                name="Launch speed"
                unit="m/s"
                value={projectile.speed}
                min={4}
                max={24}
                step={0.5}
                digits={1}
                onChange={(speed) => {
                  const next = { ...projectile, speed };
                  projectileRef.current = next;
                  setProjectile(next);
                  onLaunchChange();
                }}
              />
              <ParamSlider
                symbol="c"
                name="Drag"
                unit="kg/m"
                value={projectile.c}
                min={0}
                max={0.6}
                step={0.01}
                digits={2}
                onChange={(c) => {
                  const next = { ...projectile, c };
                  projectileRef.current = next;
                  setProjectile(next);
                  generation.current += 1;
                  workerReady.current = false;
                  runtime.clearTrajectories();
                  setBadge(null);
                  setStatus((current) => (current === "training" ? current : "idle"));
                }}
              />
            </>
          ) : (
            <>
              <ParamSlider
                symbol="r"
                name="Radius"
                unit="m"
                value={orbital.radius}
                min={0.5}
                max={2}
                step={0.05}
                digits={2}
                onChange={(radius) => {
                  const next = { ...orbital, radius };
                  orbitalRef.current = next;
                  setOrbital(next);
                  onLaunchChange();
                }}
              />
              <ParamSlider
                symbol="v"
                name="Initial speed"
                unit="m/s"
                value={orbital.speed}
                min={0.3}
                max={2}
                step={0.05}
                digits={2}
                onChange={(speed) => {
                  const next = { ...orbital, speed };
                  orbitalRef.current = next;
                  setOrbital(next);
                  onLaunchChange();
                }}
              />
            </>
          )}
        </SpotlightCard>
      </div>
    </main>
  );
}

function sameLaunch(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-3);
}

function drawProjectile(
  context: CanvasRenderingContext2D,
  runtime: MotionRuntime,
  slot: number,
  color: string,
  label: string,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const trail = runtime.trail(slot);
  let maxX = 4;
  let maxY = 2;
  for (let i = 0; i < trail.length; i += 2) {
    maxX = Math.max(maxX, trail[i]);
    maxY = Math.max(maxY, trail[i + 1]);
  }
  const ground = top + height * 0.78;
  const scale = Math.min((width - 36) / (maxX + 0.8), (ground - top - 28) / (maxY + 0.4));
  const originX = left + 18;
  context.strokeStyle = "rgba(255,255,255,0.18)";
  context.beginPath();
  context.moveTo(left, ground);
  context.lineTo(left + width, ground);
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = 1.6;
  context.beginPath();
  for (let i = 0; i < trail.length; i += 2) {
    const px = originX + trail[i] * scale;
    const py = ground - Math.max(0, trail[i + 1]) * scale;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.stroke();
  const state = runtime.states[slot];
  const y = state[1] <= 0 ? 0 : state[1];
  context.fillStyle = color;
  context.globalAlpha = runtime.active[slot] || slot === 0 ? 0.95 : 0.35;
  context.beginPath();
  context.arc(originX + state[0] * scale, ground - y * scale, 5, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  if (state[1] <= 0) {
    context.fillStyle = "#f8fafc";
    context.beginPath();
    context.moveTo(originX + state[0] * scale, ground - 8);
    context.lineTo(originX + state[0] * scale - 5, ground + 2);
    context.lineTo(originX + state[0] * scale + 5, ground + 2);
    context.fill();
  }
  context.fillStyle = "rgba(255,255,255,0.72)";
  context.font = "12px sans-serif";
  context.fillText(label, left, top + 16);
}

function drawOrbit(
  context: CanvasRenderingContext2D,
  runtime: MotionRuntime,
  slot: number,
  color: string,
  label: string,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const trail = runtime.trail(slot);
  let reach = 1.2;
  for (let i = 0; i < trail.length; i += 2) reach = Math.max(reach, Math.hypot(trail[i], trail[i + 1]));
  const cx = left + width * 0.5;
  const cy = top + height * 0.55;
  const scale = Math.min(width, height) * 0.36 / reach;
  context.fillStyle = "#fde68a";
  context.beginPath();
  context.arc(cx, cy, 5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 1.6;
  context.beginPath();
  for (let i = 0; i < trail.length; i += 2) {
    const px = cx + trail[i] * scale;
    const py = cy - trail[i + 1] * scale;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.stroke();
  const state = runtime.states[slot];
  context.fillStyle = color;
  context.globalAlpha = runtime.active[slot] || slot === 0 ? 0.95 : 0.35;
  context.beginPath();
  context.arc(cx + state[0] * scale, cy - state[1] * scale, 4.5, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = "rgba(255,255,255,0.72)";
  context.font = "12px sans-serif";
  context.fillText(label, left, top + 16);
}
