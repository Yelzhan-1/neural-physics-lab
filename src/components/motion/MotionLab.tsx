"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_DT,
  DEFAULT_ORBITAL,
  DEFAULT_PROJECTILE,
  orbitalEnergy,
  orbitalLaunch,
  orbitalRk4,
  projectileLaunch,
  projectileRk4,
  type OrbitalParams,
  type ProjectileParams,
} from "@/engine";
import { SLOTS, type SlotId } from "@/components/scene/runtime";
import { ParamSlider } from "@/components/lab/ControlPanel";
import { FractionRow, Instrument, ModelToggles, PlayButton, TrainButton } from "@/components/lab/Instrument";
import { laneFrames, NARROW_MQ, strokeLaneDividers } from "@/components/lab/lanes";
import { driftText, LiveSparks } from "@/components/lab/LiveSparks";
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
  const [percent, setPercent] = useState(20);
  const [shown, setShown] = useState<Record<SlotId, boolean>>({ physics: true, nn: true, pinn: true });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const metersRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const dockTimeRef = useRef<HTMLSpanElement>(null);
  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  const referenceRef = useRef<number[]>(kind === "orbital" ? fullOrbit({ ...DEFAULT_ORBITAL }) : []);
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
  useEffect(() => {
    if (kind === "orbital") referenceRef.current = fullOrbit(orbital);
  }, [kind, orbital]);
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
    let painted = 0;
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
      const lanes = SLOTS.filter((slot) => shownRef.current[slot.id]);
      const visible = lanes.length > 0 ? lanes : [SLOTS[0]];
      strokeLaneDividers(context, visible.length, w, h, stacked);
      const frames = laneFrames(visible.length, w, h, stacked);
      visible.forEach((slot, order) => {
        const index = SLOTS.findIndex((item) => item.id === slot.id);
        const frame = frames[order];
        if (!frame) return;
        if (kind === "projectile") {
          drawProjectile(context, runtime, index, slot.color, projectileRef.current, frame.left, frame.top, frame.width, frame.height);
        } else {
          drawOrbit(context, runtime, index, slot.color, referenceRef.current, frame.left, frame.top, frame.width, frame.height);
        }
        drawLaneLabel(context, slot.label, slot.color, frame.left + frame.width / 2, frame.top + frame.height + 14);
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
      if (painted++ % 6 === 0) writeMeters(metersRef.current, runtime, kind, orbitalRef.current);
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
      fraction: Math.min(1, Math.max(0.05, percent / 100)),
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

  const statusLine = etaLabel ?? (status === "idle" ? "Ready to train" : status);

  return (
    <Instrument
      title={kind === "projectile" ? "Projectile with drag" : "Orbital motion"}
      active={copy.active}
      controls={
        <>
          <ModelToggles
            shown={shown}
            onChange={(id, checked) => setShown((current) => ({ ...current, [id]: checked }))}
          />
          <FractionRow value={percent} onChange={setPercent} />
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
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{copy.residual}</p>
            {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          </details>
        </>
      }
      stage={
        <canvas
          ref={canvasRef}
          data-testid={copy.testId}
          className="absolute inset-0 block h-full w-full"
          role="img"
          aria-label={copy.label}
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
            bLabel={kind === "orbital" ? "Energy drift" : "Speed error"}
            formatB={kind === "orbital" ? driftText : undefined}
            logB={kind === "orbital"}
            smooth
            sample={() => {
              const physics = runtime.states[0];
              const miss = (slot: number) => {
                if (!runtime.active[slot]) return Number.NaN;
                const state = runtime.states[slot];
                return Math.hypot(state[0] - physics[0], state[1] - physics[1]);
              };
              const second = (slot: number) => {
                if (!runtime.active[slot]) return Number.NaN;
                const state = runtime.states[slot];
                if (kind === "orbital") {
                  const initial = orbitalEnergy(runtime.release, orbitalRef.current).total;
                  if (Math.abs(initial) < 1e-9) return Number.NaN;
                  return Math.abs(orbitalEnergy(state, orbitalRef.current).total - initial) / Math.abs(initial);
                }
                return Math.abs(Math.hypot(state[2], state[3]) - Math.hypot(physics[2], physics[3]));
              };
              return { t: runtime.time, aNn: miss(1), aPinn: miss(2), bNn: second(1), bPinn: second(2) };
            }}
          />
          <TrainButton className="max-lg:hidden" disabled={status === "training"} onClick={liveTrain} />
          <p className="text-center font-num text-[10px] text-balance text-muted-foreground">{statusLine}</p>
        </>
      }
      dock={
        <>
          <span className="font-num w-16 shrink-0 text-[11px] text-foreground">
            <span ref={dockTimeRef}>0.00</span> s
          </span>
          <TrainButton className="mt-0" disabled={status === "training"} onClick={liveTrain} />
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

function sameLaunch(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-3);
}

function drawProjectile(
  context: CanvasRenderingContext2D,
  runtime: MotionRuntime,
  slot: number,
  color: string,
  params: { angle: number; speed: number; g: number },
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const trail = runtime.trail(slot);
  const radians = (params.angle * Math.PI) / 180;
  const apex = (params.speed * Math.sin(radians)) ** 2 / (2 * params.g);
  const range = (params.speed * params.speed * Math.sin(2 * radians)) / params.g;
  let maxX = Math.max(2, range);
  let maxY = Math.max(1, apex);
  for (let i = 0; i < trail.length; i += 2) {
    maxX = Math.max(maxX, trail[i]);
    maxY = Math.max(maxY, trail[i + 1]);
  }
  const stateAhead = runtime.states[slot];
  maxX = Math.max(maxX, stateAhead[0]);
  maxY = Math.max(maxY, stateAhead[1]);
  const ground = top + height - 16;
  const scale = Math.min((width - 28) / (maxX * 1.08), (ground - top - 12) / (maxY * 1.12));
  const originX = left + 12;
  context.strokeStyle = "rgba(237,230,218,0.22)";
  context.beginPath();
  context.moveTo(left, ground);
  context.lineTo(left + width, ground);
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = 1.8;
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
  if (state[1] <= 0 && state[0] > 0.05) {
    context.fillStyle = "#f8fafc";
    context.beginPath();
    context.moveTo(originX + state[0] * scale, ground - 8);
    context.lineTo(originX + state[0] * scale - 5, ground + 2);
    context.lineTo(originX + state[0] * scale + 5, ground + 2);
    context.fill();
  }
}

function drawOrbit(
  context: CanvasRenderingContext2D,
  runtime: MotionRuntime,
  slot: number,
  color: string,
  reference: number[],
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const trail = runtime.trail(slot);
  let reach = 0.4;
  for (let i = 0; i < reference.length; i += 2) reach = Math.max(reach, Math.hypot(reference[i], reference[i + 1]));
  for (let i = 0; i < trail.length; i += 2) reach = Math.max(reach, Math.hypot(trail[i], trail[i + 1]));
  const stateReach = runtime.states[slot];
  reach = Math.max(reach, Math.hypot(stateReach[0], stateReach[1]));
  const cx = left + width * 0.5;
  const cy = top + height * 0.5;
  const scale = (Math.min(width, height) * 0.4) / (reach * 1.08);
  context.fillStyle = "#ede6da";
  context.beginPath();
  context.arc(cx, cy, 4.5, 0, Math.PI * 2);
  context.fill();
  strokePolyline(context, reference, cx, cy, scale, "rgba(237,230,218,0.35)", 1.2);
  context.strokeStyle = color;
  context.lineWidth = 1.8;
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
}

function strokePolyline(
  context: CanvasRenderingContext2D,
  points: number[],
  cx: number,
  cy: number,
  scale: number,
  color: string,
  width: number,
) {
  if (points.length < 4) return;
  context.beginPath();
  for (let i = 0; i < points.length; i += 2) {
    const x = cx + points[i] * scale;
    const y = cy - points[i + 1] * scale;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

function fullOrbit(params: OrbitalParams): number[] {
  const state = orbitalLaunch(params);
  const specific = orbitalEnergy(state, params).total;
  let period = Math.PI * 2;
  if (specific < 0) {
    const semiMajor = -params.gm / (2 * specific);
    period = Math.PI * 2 * Math.sqrt((semiMajor * semiMajor * semiMajor) / params.gm);
  }
  const steps = Math.min(4800, Math.max(8, Math.ceil(period / DEFAULT_DT)));
  const stride = Math.max(1, Math.floor(steps / 220));
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    if (i % stride === 0) points.push(state[0], state[1]);
    orbitalRk4(state, params, DEFAULT_DT, state);
  }
  return points;
}

function writeMeters(
  root: HTMLDivElement | null,
  runtime: MotionRuntime,
  kind: Kind,
  orbital: OrbitalParams,
) {
  if (!root) return;
  const physics = runtime.states[0];
  const initial = kind === "orbital" ? orbitalEnergy(runtime.release, orbital).total : 0;
  root.querySelectorAll<HTMLElement>("[data-lane]").forEach((lane) => {
    const slot = Number(lane.dataset.lane);
    const state = runtime.states[slot];
    const active = slot === 0 || runtime.active[slot];
    const error = lane.querySelector("[data-err]");
    if (error) {
      error.textContent = active
        ? `${Math.hypot(state[0] - physics[0], state[1] - physics[1]).toFixed(2)} m`
        : "—";
    }
    const drift = lane.querySelector("[data-drift]");
    if (drift && kind === "orbital") {
      if (!active || Math.abs(initial) < 1e-9) drift.textContent = "—";
      else {
        const energy = orbitalEnergy(state, orbital).total;
        drift.textContent = (Math.abs(energy - initial) / Math.abs(initial)).toExponential(1);
      }
    }
  });
}
