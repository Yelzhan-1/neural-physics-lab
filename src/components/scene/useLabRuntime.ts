"use client";

import { useEffect, useState } from "react";
import { LabRuntime, type RuntimeOptions } from "./runtime";

/** Longest wall-clock gap a single frame may simulate, seconds. */
const MAX_FRAME_SECONDS = 0.05;

/**
 * Creates a `LabRuntime` and drives it from one requestAnimationFrame loop
 * for as long as the component is mounted. Scenes and panels subscribe to the
 * runtime, so the page runs a single loop however many views it shows.
 */
export function useLabRuntime(options?: RuntimeOptions): LabRuntime {
  const [runtime] = useState(() => new LabRuntime(options));

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      runtime.tick(elapsed > MAX_FRAME_SECONDS ? MAX_FRAME_SECONDS : elapsed);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [runtime]);

  return runtime;
}
