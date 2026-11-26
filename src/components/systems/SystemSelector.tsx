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

/** Quiet text tabs. Every tab opens that system. */
export function SystemSelector({ active, className }: { active?: string; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<PhysicalSystem | null>(null);

  return (
    <>
      <nav
        className={cn("flex flex-wrap gap-x-5 gap-y-1 border-b border-hairline", className)}
        aria-label="Physical systems"
      >
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
                "-mb-px border-b py-2 text-[13px] tracking-tight",
                current
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {system.name}
            </button>
          );
        })}
      </nav>
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
        className="w-full max-w-md rounded-[10px] border border-hairline bg-panel p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-num text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{system.code}</p>
        <h2 id="coming-next-title" className="mt-2 text-xl font-medium tracking-tight text-foreground">
          {system.name}
        </h2>
        <p className="mt-3 font-num text-sm text-foreground">{system.summary}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This system is registered. Its scene and trainer are next in the lab.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-9 rounded-[8px] border border-hairline px-4 text-sm text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}
