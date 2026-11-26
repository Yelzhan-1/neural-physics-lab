"use client";

import { motion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PARAMS, type PendulumParams } from "@/engine";
import { divergenceTime } from "@/components/scene/divergence";
import { PendulumScene, type SceneLayout } from "@/components/scene/PendulumScene";
import type { SceneView } from "@/components/scene/draw";
import { useLabRuntime } from "@/components/scene/useLabRuntime";
import { SpotlightCard } from "@/components/site/SpotlightCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SystemSelector } from "@/components/systems/SystemSelector";
import { OrbitalLab, ProjectileLab } from "@/components/motion/MotionLab";
import { SpringLab } from "@/components/spring/SpringLab";
import { ControlPanel } from "./ControlPanel";
import { ModelPanel } from "./ModelPanel";
import { PhysicsPanel } from "./PhysicsPanel";
import { ChallengePanel } from "./ChallengePanel";
import { TrainPanel } from "./TrainPanel";
import { DEMO_POSE, useLabModels } from "./useLabModels";
import { DEMO_THETA1, DEMO_THETA2, ROLLOUT_SECONDS } from "@/ml/constants";

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const LAYOUTS: { id: SceneLayout; label: string }[] = [
  { id: "split", label: "Side by side" },
  { id: "overlay", label: "Overlay" },
];

const entrance = {
  initial: { opacity: 0, y: 18, filter: "blur(8px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
};

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
  const onLiveReady = useRef<() => void>(() => {});

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

  return (
    <main className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 px-4 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start xl:grid-cols-[minmax(0,1fr)_380px]">
      <SystemSelector active="double-pendulum" className="order-1 lg:col-span-2" />
      <div className="order-2 min-w-0 lg:col-start-1 lg:row-start-2">
        <motion.div {...entrance} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <SpotlightCard className="overflow-hidden">
            <div className="h-[480px] sm:h-[clamp(360px,46vh,560px)]">
              <PendulumScene
                runtime={runtime}
                view={view}
                layout={layout}
                interactive
                onAnglesChange={onDrag}
                ariaLabel="Double pendulum: physics solver next to the Standard NN and PINN slots"
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-white/[0.07] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setPlaying((value) => !value)}
                  aria-label={playing ? "Pause" : "Play"}
                  className="w-[88px] gap-1.5 font-medium shadow-[0_0_24px_-6px_var(--physics)]"
                >
                  {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  {playing ? "Pause" : "Play"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runtime.reset()}
                  className="gap-1.5"
                >
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              </div>

              <div
                role="group"
                aria-label="Playback speed"
                className="flex rounded-lg bg-white/[0.05] p-0.5 text-xs ring-1 ring-white/[0.07]"
              >
                {[1, 2, 4].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={speed === value}
                    onClick={() => setSpeed(value)}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 font-num font-medium",
                      speed === value ? "bg-white/10 text-white" : "text-white/55 hover:text-white",
                    )}
                  >
                    {value}×
                  </button>
                ))}
              </div>

              <div className="flex min-w-[180px] flex-1 items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-num w-14 shrink-0 text-white/80">
                    t <span ref={timeRef}>0.00</span>s
                  </span>
                  <input
                    ref={rangeRef}
                    type="range"
                    min={0}
                    max={ROLLOUT_SECONDS}
                    step={0.05}
                    defaultValue={0}
                    aria-label="Timeline"
                    className="h-1 w-full accent-cyan-300"
                    onPointerDown={() => {
                      scrubbing.current = true;
                    }}
                    onPointerUp={() => {
                      scrubbing.current = false;
                    }}
                    onChange={(event) => runtime.seek(Number(event.target.value))}
                  />
                </label>
              </div>

              <Button size="sm" variant="outline" onClick={() => jumpTo(3)}>
                Jump to t = 3 s
              </Button>
              <Button size="sm" variant="outline" onClick={jumpDivergence}>
                Jump to divergence
              </Button>
              <Button
                size="sm"
                variant={demo ? "default" : "outline"}
                aria-pressed={demo}
                onClick={() => (demo ? leaveDemo() : enterDemo())}
                className="rounded-full"
              >
                Demo mode
              </Button>
              {theta1 === DEMO_THETA1 && theta2 === DEMO_THETA2 && (
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] tracking-wide text-white/70 uppercase">
                  Demo pose
                </span>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:ml-auto">
                <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground transition-colors hover:text-white">
                  <Switch
                    checked={view === "arm"}
                    onCheckedChange={(checked) => setView(checked ? "arm" : "pendulum")}
                    aria-label="Robot arm view"
                  />
                  Robot arm
                </label>

                <div
                  role="radiogroup"
                  aria-label="Layout"
                  className="flex rounded-lg bg-white/[0.05] p-0.5 text-xs ring-1 ring-white/[0.07]"
                >
                  {LAYOUTS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={layout === option.id}
                      onClick={() => setLayout(option.id)}
                      className={cn(
                        "relative rounded-md px-3 py-1.5 font-medium transition-colors",
                        layout === option.id
                          ? "text-white"
                          : "text-muted-foreground hover:text-white",
                      )}
                    >
                      {layout === option.id && (
                        <motion.span
                          layoutId="layout-pill"
                          className="absolute inset-0 rounded-md bg-white/10 ring-1 ring-white/10"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                      <span className="relative">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      </div>

      <motion.div
        {...entrance}
        transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        className="order-4 min-w-0 lg:col-start-1"
      >
        <ModelPanel runtime={runtime} slotsReady={models.slotsReady} />
      </motion.div>

      <details className="order-5 min-w-0 rounded-2xl border border-white/10 bg-white/[0.02] lg:col-start-1">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-white">Physics readout</summary>
        <div className="px-1 pb-1">
          <PhysicsPanel runtime={runtime} />
        </div>
      </details>

      <div className="order-3 grid content-start gap-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-2 lg:row-span-3 lg:max-h-[calc(100svh-2rem)] lg:self-start lg:overflow-y-auto">
        <motion.div {...entrance} transition={{ duration: 0.7, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}>
          <TrainPanel models={models} onUsePretrained={restorePretrained} />
          <ChallengePanel
            models={models}
            runtime={runtime}
            params={params}
            setPlaying={setPlaying}
            setSpeed={setSpeed}
            setAngles={setAngles}
          />
        </motion.div>
        <details className="rounded-2xl border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-white">Sandbox</summary>
          <div className="px-1 pb-1">
            <ControlPanel
              params={params}
              theta1={theta1}
              theta2={theta2}
              onParamsChange={setParams}
              onAnglesChange={setAngles}
            />
          </div>
        </details>
      </div>
    </main>
  );
}
