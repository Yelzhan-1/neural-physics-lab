"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  /** Highlight colour as space-separated RGB, for example "34 211 238". */
  tint?: string;
}

/** Glass panel whose highlight follows the pointer. */
export function SpotlightCard({ children, className, tint }: SpotlightCardProps) {
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };

  return (
    <div
      onPointerMove={onPointerMove}
      style={tint ? ({ "--spot": tint } as CSSProperties) : undefined}
      className={cn("glass spotlight rounded-2xl", className)}
    >
      {children}
    </div>
  );
}
