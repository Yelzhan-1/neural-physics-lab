"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SYSTEMS, type PhysicalSystem } from "@/ml/systems";
import { cn } from "@/lib/utils";

const HREF: Record<string, string> = {
  "double-pendulum": "/lab",
  "spring-mass": "/lab?system=spring",
  projectile: "/lab?system=projectile",
  orbital: "/lab?system=orbital",
};

/** Every card does something: open that system, or a short note on what is next. */
export function SystemSelector({ active, className }: { active?: string; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<PhysicalSystem | null>(null);

  return (
    <>
      <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)} role="list" aria-label="Physical systems">
        {SYSTEMS.map((system) => {
          const ready = system.status === "ready";
          const current = system.id === active;
          return (
            <button
              key={system.id}
              type="button"
              aria-current={current ? "true" : undefined}
              onClick={() => {
                if (!ready) {
                  setPending(system);
                  return;
                }
                router.push(HREF[system.id] ?? "/lab");
              }}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-colors",
                current
                  ? "border-physics/40 bg-physics/10 text-white shadow-[0_0_24px_-12px_var(--physics)]"
                  : "border-white/10 bg-white/[0.03] text-white/80 hover:border-white/25 hover:text-white",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-num text-[10px] tracking-[0.16em] text-white/45 uppercase">
                  {system.code}
                </span>
                {!ready && (
                  <span className="text-[10px] tracking-wide text-white/40 uppercase">Coming next</span>
                )}
              </span>
              <span className="mt-1 block text-[13px] font-medium tracking-tight">{system.name}</span>
            </button>
          );
        })}
      </div>
      {pending && <ComingNext system={pending} onClose={() => setPending(null)} />}
    </>
  );
}

function ComingNext({ system, onClose }: { system: PhysicalSystem; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coming-next-title"
        data-testid="coming-next"
        className="glass w-full max-w-md rounded-2xl p-6 shadow-[0_0_80px_-24px_var(--pinn)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-num text-[10px] tracking-[0.18em] text-white/45 uppercase">{system.code}</p>
        <h2 id="coming-next-title" className="mt-2 text-xl font-semibold tracking-tight text-white">
          {system.name}
        </h2>
        <p className="mt-3 font-num text-sm text-physics">{system.summary}</p>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          This card is a registered PhysicalSystem. The scene, the RK4 stepper, and the train panel
          for this law are next in the lab.
        </p>
        <p className="mt-3 text-sm text-white/55">Upload your own data — planned.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-9 rounded-full bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/15"
        >
          Close
        </button>
      </div>
    </div>
  );
}
