"use client";

import { motion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PARAMS, type PendulumParams } from "@/engine";
import { PendulumScene, type SceneLayout } from "@/components/scene/PendulumScene";
import type { SceneView } from "@/components/scene/draw";
import { useLabRuntime } from "@/components/scene/useLabRuntime";
import { SpotlightCard } from "@/components/site/SpotlightCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ControlPanel, ParamSlider } from "./ControlPanel";
import { PhysicsPanel } from "./PhysicsPanel";

const DEFAULT_THETA1 = 120;
const DEFAULT_THETA2 = -20;
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

export function Lab() {
  const runtime = useLabRuntime();
  const [params, setParams] = useState<PendulumParams>({ ...DEFAULT_PARAMS });
  const [theta1, setTheta1] = useState(DEFAULT_THETA1);
  const [theta2, setTheta2] = useState(DEFAULT_THETA2);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<SceneView>("pendulum");
  const [layout, setLayout] = useState<SceneLayout>("split");

  useEffect(() => runtime.setParams(params), [runtime, params]);
  useEffect(
    () => runtime.setInitialAngles(toRadians(theta1), toRadians(theta2)),
    [runtime, theta1, theta2],
  );
  useEffect(() => runtime.setPlaying(playing), [runtime, playing]);
  useEffect(() => runtime.setSpeed(speed), [runtime, speed]);

  const setAngles = useCallback((next1: number, next2: number) => {
    setTheta1(next1);
    setTheta2(next2);
  }, []);
  const onDrag = useCallback(
    (next1: number, next2: number) => setAngles(toDegrees(next1), toDegrees(next2)),
    [setAngles],
  );

  return (
    <main className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 px-4 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 content-start gap-4">
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

              <div className="w-40 min-w-32 flex-1 sm:max-w-52">
                <ParamSlider
                  symbol="×"
                  name="Speed"
                  unit="×"
                  value={speed}
                  min={0.1}
                  max={3}
                  step={0.1}
                  digits={1}
                  onChange={setSpeed}
                />
              </div>

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

        <motion.div
          {...entrance}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <PhysicsPanel runtime={runtime} />
        </motion.div>
      </div>

      <motion.aside
        {...entrance}
        transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="lg:sticky lg:top-4 lg:self-start"
      >
        <ControlPanel
          params={params}
          theta1={theta1}
          theta2={theta2}
          onParamsChange={setParams}
          onAnglesChange={setAngles}
        />
      </motion.aside>
    </main>
  );
}
