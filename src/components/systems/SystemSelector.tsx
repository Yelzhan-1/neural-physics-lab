"use client";

import { SYSTEMS } from "@/ml/systems";
import { cn } from "@/lib/utils";

/** Experiment 01 is the double pendulum. The other systems are registered and disabled. */
export function SystemSelector({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)} role="list" aria-label="Physical systems">
      {SYSTEMS.map((system) => {
        const ready = system.status === "ready";
        return (
          <button
            key={system.id}
            type="button"
            disabled={!ready}
            aria-current={ready ? "true" : undefined}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-left transition-colors",
              ready
                ? "border-physics/40 bg-physics/10 text-white shadow-[0_0_24px_-12px_var(--physics)]"
                : "cursor-not-allowed border-white/10 bg-white/[0.02] text-white/35",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-num text-[10px] tracking-[0.16em] text-white/45 uppercase">
                {system.code}
              </span>
              {!ready && (
                <span className="text-[10px] tracking-wide text-white/35 uppercase">Coming soon</span>
              )}
            </span>
            <span className="mt-1 block text-[13px] font-medium tracking-tight">{system.name}</span>
          </button>
        );
      })}
    </div>
  );
}
