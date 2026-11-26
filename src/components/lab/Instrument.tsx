import type { ReactNode } from "react";
import { DATA_FRACTIONS } from "@/ml/constants";
import { SystemSelector } from "@/components/systems/SystemSelector";
import { cn } from "@/lib/utils";

/** One hairline instrument: controls, the simulation, and live metrics. */
export function Instrument({
  title,
  active,
  controls,
  stage,
  timeline,
  metrics,
}: {
  title: string;
  active: string;
  controls: ReactNode;
  stage: ReactNode;
  timeline: ReactNode;
  metrics: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-3 pt-4 pb-6 sm:px-6">
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
        <div className="grid lg:grid-cols-[230px_minmax(0,1fr)_210px]">
          <aside className="order-2 border-b border-hairline px-4 py-4 lg:order-1 lg:border-r lg:border-b-0">
            <h2 className="text-[13px] font-medium text-foreground">Controls</h2>
            <div className="mt-4 grid gap-4">{controls}</div>
          </aside>
          <section className="order-1 flex min-w-0 flex-col border-b border-hairline lg:order-2 lg:border-r lg:border-b-0">
            <header className="flex h-10 items-center justify-between border-b border-hairline px-4">
              <h2 className="text-[13px] font-medium text-foreground">Simulation</h2>
            </header>
            <div className="sim-grid relative min-h-[560px] flex-1 lg:min-h-[480px]">{stage}</div>
            <div className="flex h-12 items-center gap-3 border-t border-hairline px-3">
              <span className="font-num shrink-0 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Timeline
              </span>
              {timeline}
            </div>
          </section>
          <aside className="order-3 flex flex-col px-4 py-4">
            <h2 className="text-[13px] font-medium text-foreground">Live metrics</h2>
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">{metrics}</div>
          </aside>
        </div>
      </div>
    </main>
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
}: {
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-auto h-11 w-full rounded-full bg-pinn text-sm font-semibold text-[#14160c] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
