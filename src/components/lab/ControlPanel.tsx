"use client";

import type { ReactNode } from "react";
import type { PendulumParams } from "@/engine";
import { Slider } from "@/components/ui/slider";
import { SpotlightCard } from "@/components/site/SpotlightCard";

interface ParamSliderProps {
  symbol: ReactNode;
  name: string;
  /** Accessible name, when `name` alone is ambiguous. */
  ariaLabel?: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  digits: number;
  onChange: (value: number) => void;
}

export function ParamSlider({
  symbol,
  name,
  ariaLabel,
  unit,
  value,
  min,
  max,
  step,
  digits,
  onChange,
}: ParamSliderProps) {
  return (
    <label className="group grid gap-2">
      <span className="flex items-baseline justify-between gap-3 text-xs">
        <span className="flex items-baseline gap-2 text-muted-foreground">
          <span className="font-num w-5 text-[13px] text-white/90">{symbol}</span>
          {name}
        </span>
        <span className="font-num text-[13px] text-white">
          {value.toFixed(digits)}
          <span className="ml-1 text-muted-foreground">{unit}</span>
        </span>
      </span>
      <Slider
        aria-label={ariaLabel ?? name}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
      />
    </label>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <sub className="text-[0.7em]">{children}</sub>;
}

interface ControlPanelProps {
  params: PendulumParams;
  theta1: number;
  theta2: number;
  onParamsChange: (params: PendulumParams) => void;
  onAnglesChange: (theta1: number, theta2: number) => void;
}

/** Sandbox controls: release angles in degrees and the physical parameters. */
export function ControlPanel({
  params,
  theta1,
  theta2,
  onParamsChange,
  onAnglesChange,
}: ControlPanelProps) {
  const set = (key: keyof PendulumParams) => (value: number) =>
    onParamsChange({ ...params, [key]: value });

  return (
    <SpotlightCard className="p-5 sm:p-6">
      <h2 className="text-sm font-semibold tracking-tight text-white">Sandbox</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Every change restarts the run from the release pose.
      </p>

      <fieldset className="mt-5 grid gap-4">
        <legend className="mb-3 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Release pose
        </legend>
        <ParamSlider
          symbol={<>θ<Sub>1</Sub></>}
          name="Upper angle"
          unit="°"
          value={theta1}
          min={-180}
          max={180}
          step={1}
          digits={0}
          onChange={(value) => onAnglesChange(value, theta2)}
        />
        <ParamSlider
          symbol={<>θ<Sub>2</Sub></>}
          name="Lower angle"
          unit="°"
          value={theta2}
          min={-180}
          max={180}
          step={1}
          digits={0}
          onChange={(value) => onAnglesChange(theta1, value)}
        />
      </fieldset>

      <fieldset className="mt-6 grid gap-4">
        <legend className="mb-3 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          System
        </legend>
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-1 xl:grid-cols-2">
          <ParamSlider
            symbol={<>m<Sub>1</Sub></>}
            name="Mass"
            ariaLabel="Mass of bob 1"
            unit="kg"
            value={params.m1}
            min={0.2}
            max={5}
            step={0.1}
            digits={1}
            onChange={set("m1")}
          />
          <ParamSlider
            symbol={<>m<Sub>2</Sub></>}
            name="Mass"
            ariaLabel="Mass of bob 2"
            unit="kg"
            value={params.m2}
            min={0.2}
            max={5}
            step={0.1}
            digits={1}
            onChange={set("m2")}
          />
          <ParamSlider
            symbol={<>l<Sub>1</Sub></>}
            name="Length"
            ariaLabel="Length of link 1"
            unit="m"
            value={params.l1}
            min={0.3}
            max={2}
            step={0.05}
            digits={2}
            onChange={set("l1")}
          />
          <ParamSlider
            symbol={<>l<Sub>2</Sub></>}
            name="Length"
            ariaLabel="Length of link 2"
            unit="m"
            value={params.l2}
            min={0.3}
            max={2}
            step={0.05}
            digits={2}
            onChange={set("l2")}
          />
        </div>
        <ParamSlider
          symbol="g"
          name="Gravity"
          unit="m/s²"
          value={params.g}
          min={1}
          max={25}
          step={0.01}
          digits={2}
          onChange={set("g")}
        />
      </fieldset>
    </SpotlightCard>
  );
}
