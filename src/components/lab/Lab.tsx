"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PARAMS, type PendulumParams } from "@/engine";
import { divergenceTime } from "@/components/scene/divergence";
import { PendulumScene, type SceneLayout } from "@/components/scene/PendulumScene";
import type { SceneView } from "@/components/scene/draw";
import { SLOTS, type SlotId } from "@/components/scene/runtime";
import { useLabRuntime } from "@/components/scene/useLabRuntime";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { OrbitalLab, ProjectileLab } from "@/components/motion/MotionLab";
import { SpringLab } from "@/components/spring/SpringLab";
import { ControlPanel } from "./ControlPanel";
import { FractionRow, Instrument, PlayButton, TrainButton } from "./Instrument";
import { ModelPanel } from "./ModelPanel";
import { PhysicsPanel } from "./PhysicsPanel";
import { ChallengePanel } from "./ChallengePanel";
import { TrainPanel } from "./TrainPanel";
import { DEMO_POSE, useLabModels } from "./useLabModels";
import { DEFAULT_LAMBDA, DEMO_THETA1, DEMO_THETA2, ROLLOUT_SECONDS } from "@/ml/constants";

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const LAYOUTS: { id: SceneLayout; label: string }[] = [
  { id: "split", label: "Side by side" },
  { id: "overlay", label: "Overlay" },
];

function sameParams(a: PendulumParams, b: PendulumParams): boolean {
  return a.m1 === b.m1 && a.m2 === b.m2 && a.l1 === b.l1 && a.l2 === b.l2 && a.g === b.g && a.damping === b.damping;
}

export function Lab({ demo = false, system = "pendulum" }: { demo?: boolean; system?: string }) {
  if (system === "spring") return <SpringLab />;
  if (system === "projectile") return <ProjectileLab />;
  if (system === "orbital") return <OrbitalLab />;
  return <PendulumLab demo={demo} />;
}

function PendulumLab({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const runtime = useLabRuntime();
  const [params, setParams] = useState<PendulumParams>({ ...DEFAULT_PARAMS });
  const [theta1, setTheta1] = useState(DEMO_THETA1);
  const [theta2, setTheta2] = useState(DEMO_THETA2);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(demo ? 2 : 1);
  const [view, setView] = useState<SceneView>("pendulum");
  const [layout, setLayout] = useState<SceneLayout>(demo ? "overlay" : "split");
  const [percent, setPercent] = useState(20);
  const [lambda, setLambda] = useState(DEFAULT_LAMBDA);
  const [shown, setShown] = useState<Record<SlotId, boolean>>({ physics: true, nn: true, pinn: true });
  const onLiveReady = useRef<() => void>(() => {});
  const visibleSlots = SLOTS.map((slot) => slot.id).filter((id) => shown[id]);

  useEffect(() => runtime.setParams(params), [runtime, params]);
  useEffect(
    () => runtime.setInitialAngles(toRadians(theta1), toRadians(theta2)),
    [runtime, theta1, theta2],
  );
  useEffect(() => runtime.setPlaying(playing), [runtime, playing]);
  useEffect(() => runtime.setSpeed(speed), [runtime, speed]);
  useEffect(() => {
    onLiveReady.current = () => {
      setSpeed(2);
      setLayout("overlay");
      setPlaying(true);
    };
  }, []);
  const models = useLabModels(runtime, { theta1, theta2, params }, demo, onLiveReady);
  const pendingRestore = useRef(false);
  const timeRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const scrubbing = useRef(false);

  const restorePretrained = useCallback(() => {
    const already =
      theta1 === DEMO_THETA1 && theta2 === DEMO_THETA2 && sameParams(params, DEFAULT_PARAMS);
    pendingRestore.current = !already;
    setParams({ ...DEFAULT_PARAMS });
    setTheta1(DEMO_THETA1);
    setTheta2(DEMO_THETA2);
    setPlaying(true);
    if (already) models.usePretrained();
  }, [models, params, theta1, theta2]);

  useEffect(() => {
    if (!pendingRestore.current) return;
    if (theta1 !== DEMO_THETA1 || theta2 !== DEMO_THETA2 || !sameParams(params, DEFAULT_PARAMS)) return;
    pendingRestore.current = false;
    models.usePretrained();
  }, [models, params, theta1, theta2]);

  const enterDemo = () => {
    setSpeed(2);
    setLayout("overlay");
    setPlaying(true);
    const already =
      theta1 === DEMO_POSE.theta1 && theta2 === DEMO_POSE.theta2 && sameParams(params, DEFAULT_PARAMS);
    if (!already) {
      pendingRestore.current = true;
      setParams({ ...DEFAULT_PARAMS });
      setTheta1(DEMO_POSE.theta1);
      setTheta2(DEMO_POSE.theta2);
    } else {
      const trajectory = runtime.trajectories[1];
      if (trajectory) {
        runtime.seek(divergenceTime(trajectory.states, trajectory.dt, runtime.params, runtime.initial));
      }
    }
    router.push("/lab?demo=1");
  };

  const leaveDemo = () => {
    setSpeed(1);
    setLayout("split");
    router.push("/lab");
  };

  useEffect(() => {
    return runtime.onFrame(() => {
      if (timeRef.current) timeRef.current.textContent = runtime.time.toFixed(2);
      if (rangeRef.current && !scrubbing.current) rangeRef.current.value = String(runtime.time);
    });
  }, [runtime]);

  const jumpTo = (seconds: number) => {
    runtime.seek(seconds);
    if (rangeRef.current) rangeRef.current.value = String(seconds);
    setPlaying(true);
  };

  const jumpDivergence = () => {
    const trajectory = runtime.trajectories[1];
    if (!trajectory) return;
    const time = divergenceTime(trajectory.states, trajectory.dt, runtime.params, runtime.initial);
    jumpTo(time);
    setSpeed(2);
    setLayout("overlay");
  };

  const setAngles = useCallback((next1: number, next2: number) => {
    setTheta1(next1);
    setTheta2(next2);
  }, []);
  const onDrag = useCallback(
    (next1: number, next2: number) => setAngles(toDegrees(next1), toDegrees(next2)),
    [setAngles],
  );

  const statusLine =
    models.phase === "calibrating"
      ? "Calibrating…"
      : models.phase === "training" && models.etaSeconds != null
        ? `Training… ${Math.max(0, Math.ceil(models.etaSeconds))} s left`
        : models.status === "pretrained"
          ? `Pretrained · ${models.pretrainedSteps} steps`
          : models.status === "training"
            ? "Training…"
            : "Ready to train";

  return (
    <Instrument
      title="Double pendulum"
      active="double-pendulum"
      controls={
        <>
          <div>
            <p className="font-num text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Models</p>
            <div className="mt-2 grid gap-2">
              {SLOTS.map((slot) => (
                <label key={slot.id} className="flex items-center justify-between gap-2 text-xs text-foreground">
                  <span className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full" style={{ background: slot.color }} />
                    {slot.id === "physics" ? "Physics" : slot.label}
                  </span>
                  <Switch
                    size="sm"
                    checked={shown[slot.id]}
                    onCheckedChange={(checked) => setShown((current) => ({ ...current, [slot.id]: checked }))}
                    aria-label={slot.label}
                  />
                </label>
              ))}
            </div>
          </div>
          <FractionRow value={percent} onChange={setPercent} />
          <ControlPanel
            part="primary"
            params={params}
            theta1={theta1}
            theta2={theta2}
            onParamsChange={setParams}
            onAnglesChange={setAngles}
          />
          <button
            type="button"
            aria-pressed={demo}
            onClick={() => (demo ? leaveDemo() : enterDemo())}
            className="text-left font-num text-[11px] tracking-[0.12em] text-muted-foreground uppercase"
          >
            {demo ? "Leave demo" : "Demo mode"}
          </button>
          {theta1 === DEMO_THETA1 && theta2 === DEMO_THETA2 && (
            <p className="font-num text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Demo pose</p>
          )}
          <details className="border-t border-hairline pt-3">
            <summary className="cursor-pointer font-num text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              More
            </summary>
            <div className="mt-3 grid gap-3">
              <label className="flex items-center justify-between gap-2 text-xs text-foreground">
                <span>Robot arm</span>
                <Switch
                  size="sm"
                  checked={view === "arm"}
                  onCheckedChange={(checked) => setView(checked ? "arm" : "pendulum")}
                  aria-label="Robot arm view"
                />
              </label>
              <div role="radiogroup" aria-label="Layout" className="flex gap-2 text-xs">
                {LAYOUTS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={layout === option.id}
                    onClick={() => setLayout(option.id)}
                    className={cn(
                      "rounded-[6px] border px-2 py-1",
                      layout === option.id ? "border-foreground text-foreground" : "border-hairline text-muted-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Playback speed" className="flex gap-2 text-xs">
                {[1, 2, 4].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={speed === value}
                    onClick={() => setSpeed(value)}
                    className={cn(
                      "font-num rounded-[6px] border px-2 py-1",
                      speed === value ? "border-foreground text-foreground" : "border-hairline text-muted-foreground",
                    )}
                  >
                    {value}×
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => jumpTo(3)}>
                  Jump to t = 3 s
                </Button>
                <Button size="sm" variant="outline" onClick={jumpDivergence}>
                  Jump to divergence
                </Button>
              </div>
              <TrainPanel
                models={models}
                onUsePretrained={restorePretrained}
                percent={percent}
                lambda={lambda}
                setLambda={setLambda}
              />
              <details>
                <summary className="cursor-pointer text-sm text-foreground">Sandbox</summary>
                <div className="pt-3">
                  <ControlPanel
                    part="rest"
                    params={params}
                    theta1={theta1}
                    theta2={theta2}
                    onParamsChange={setParams}
                    onAnglesChange={setAngles}
                  />
                </div>
              </details>
              <details>
                <summary className="cursor-pointer text-sm text-foreground">Physics readout</summary>
                <div className="pt-3">
                  <PhysicsPanel runtime={runtime} />
                </div>
              </details>
              <ChallengePanel
                models={models}
                runtime={runtime}
                params={params}
                setPlaying={setPlaying}
                setSpeed={setSpeed}
                setAngles={setAngles}
              />
            </div>
          </details>
        </>
      }
      stage={
        <div className="absolute inset-0">
          <PendulumScene
            runtime={runtime}
            view={view}
            layout={layout}
            slots={visibleSlots.length > 0 ? visibleSlots : ["physics"]}
            interactive
            onAnglesChange={onDrag}
            ariaLabel="Double pendulum: physics solver next to the Standard NN and PINN slots"
          />
        </div>
      }
      timeline={
        <>
          <PlayButton playing={playing} onClick={() => setPlaying((value) => !value)} />
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <input
              ref={rangeRef}
              type="range"
              min={0}
              max={ROLLOUT_SECONDS}
              step={0.05}
              defaultValue={0}
              aria-label="Timeline"
              className="scrub w-full"
              onPointerDown={() => {
                scrubbing.current = true;
              }}
              onPointerUp={() => {
                scrubbing.current = false;
              }}
              onChange={(event) => runtime.seek(Number(event.target.value))}
            />
          </label>
          <span className="font-num w-14 shrink-0 text-right text-[11px] text-foreground">
            <span ref={timeRef}>0.00</span> s
          </span>
        </>
      }
      metrics={
        <>
          <ModelPanel runtime={runtime} slotsReady={models.slotsReady} />
          <TrainButton disabled={models.status === "training" || models.status === "loading"} onClick={models.liveTrain} />
          <p className="text-center font-num text-[11px] text-muted-foreground">{statusLine}</p>
        </>
      }
    />
  );
}
