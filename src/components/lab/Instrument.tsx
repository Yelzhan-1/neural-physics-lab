"use client";

import type { ReactNode } from "react";
import { DATA_FRACTIONS } from "@/ml/constants";
import { SLOTS, type SlotId } from "@/components/scene/runtime";
import { SystemSelector } from "@/components/systems/SystemSelector";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** One hairline instrument: controls, the simulation, and live metrics. */
export function Instrument({
  title,
  active,
  controls,
  stage,
  timeline,
  metrics,
  dock,
}: {
  title: string;
  active: string;
  controls: ReactNode;
  stage: ReactNode;
  timeline: ReactNode;
  metrics: ReactNode;
  /** Mobile bar: the live-train button and the clock, fixed to the viewport. */
  dock?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-3 pt-4 pb-24 sm:px-6 lg:pb-6">
      <p className="font-num text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Simulation lab</p>
      <div className="mt-1 flex items-end justify-between gap-4">
        <h1 className="text-[clamp(2.1rem,4.2vw,3.5rem)] leading-none font-medium tracking-[-0.055em] text-foreground">
          {title}
        </h1>
        <p className="mb-1 hidden font-num text-[10px] tracking-[0.14em] text-muted-foreground uppercase sm:block">
          RK4 ground truth
        </p>
      </div>
      <SystemSelector active={active} className="mt-4" />
      <div className="mt-3 overflow-hidden rounded-[10px] border border-hairline bg-panel">
        <div className="grid lg:grid-cols-[168px_minmax(0,1fr)_156px] xl:grid-cols-[220px_minmax(0,1fr)_200px]">
          <aside className="order-3 border-b border-hairline px-4 py-4 lg:order-1 lg:border-r lg:border-b-0">
            <h2 className="text-[13px] font-medium text-foreground">Controls</h2>
            <div className="mt-4 grid gap-4">{controls}</div>
          </aside>
          <section className="order-1 flex min-w-0 flex-col border-b border-hairline lg:order-2 lg:border-r lg:border-b-0">
            <header className="flex h-10 items-center justify-between border-b border-hairline px-4">
              <h2 className="text-[13px] font-medium text-foreground">Simulation</h2>
            </header>
            <div className="sim-grid relative min-h-[460px] flex-1 lg:min-h-[480px]">{stage}</div>
            <div className="flex h-12 items-center gap-3 border-t border-hairline px-3">
              <span className="font-num shrink-0 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Timeline
              </span>
              {timeline}
            </div>
          </section>
          <aside className="order-2 flex flex-col px-4 py-4 lg:order-3">
            <h2 className="text-[13px] font-medium text-foreground">Live metrics</h2>
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">{metrics}</div>
          </aside>
        </div>
      </div>
      {dock ? (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-hairline bg-panel px-3 py-2 lg:hidden">
          {dock}
        </div>
      ) : null}
    </main>
  );
}

export function ModelToggles({
  shown,
  onChange,
}: {
  shown: Record<SlotId, boolean>;
  onChange: (id: SlotId, checked: boolean) => void;
}) {
  return (
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
              onCheckedChange={(checked) => onChange(slot.id, checked)}
              aria-label={slot.label}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={playing ? "Pause" : "Play"}
      onClick={onClick}
      className="grid size-8 shrink-0 place-items-center rounded-[4px] border border-hairline text-foreground"
    >
      {playing ? (
        <span className="flex gap-[3px]" aria-hidden>
          <span className="block h-2.5 w-0.5 bg-current" />
          <span className="block h-2.5 w-0.5 bg-current" />
        </span>
      ) : (
        <span aria-hidden className="ml-0.5 border-y-[5px] border-l-[7px] border-y-transparent border-l-current" />
      )}
    </button>
  );
}

export function FractionRow({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div>
      <p className="font-num text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Training data</p>
      <div role="group" aria-label="Training data" className="mt-2 flex overflow-hidden rounded-[6px] border border-hairline">
        {DATA_FRACTIONS.map((size) => (
          <button
            key={size}
            type="button"
            aria-pressed={value === size}
            onClick={() => onChange(size)}
            className={cn(
              "flex-1 py-1.5 font-num text-[11px]",
              value === size ? "bg-foreground text-background" : "text-muted-foreground",
            )}
          >
            {size}%
          </button>
        ))}
      </div>
    </div>
  );
}

export function TrainButton({
  disabled,
  onClick,
  children = "Live train (~20 s)",
  className,
}: {
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "mt-auto h-11 w-full rounded-full bg-pinn text-sm font-semibold text-[#14160c] disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
