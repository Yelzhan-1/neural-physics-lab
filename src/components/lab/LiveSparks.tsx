"use client";

import { useEffect, useRef, type RefObject } from "react";

const NN = "#ff6a3d";
const PINN = "#c8f04a";
const CAPACITY = 120;
const WINDOW_SECONDS = 8;
const LOG_FLOOR = 1e-5;

export interface SparkSample {
  /** Simulation time. When present, the chart keeps a fixed window and resets on a seek. */
  t?: number;
  aNn: number;
  aPinn: number;
  bNn: number;
  bPinn: number;
}

/** Two hairline sparklines fed by a live sampler. */
export function LiveSparks({
  aLabel,
  bLabel,
  sample,
  formatA = metres,
  formatB = metres,
  logB = false,
  smooth = false,
  slotsReady,
}: {
  aLabel: string;
  bLabel: string;
  sample: () => SparkSample;
  formatA?: (value: number) => string;
  formatB?: (value: number) => string;
  /** Draw the second series on a log scale so a small drift stays readable. */
  logB?: boolean;
  smooth?: boolean;
  /** Marks the tip-error rows for the pretrained demo. */
  slotsReady?: boolean;
}) {
  const aRef = useRef<HTMLCanvasElement>(null);
  const bRef = useRef<HTMLCanvasElement>(null);
  const aNn = useRef<HTMLElement>(null);
  const aPinn = useRef<HTMLElement>(null);
  const bNn = useRef<HTMLElement>(null);
  const bPinn = useRef<HTMLElement>(null);
  const sampleRef = useRef(sample);
  useEffect(() => {
    sampleRef.current = sample;
  }, [sample]);

  useEffect(() => {
    const series = {
      aNn: [] as number[],
      aPinn: [] as number[],
      bNn: [] as number[],
      bPinn: [] as number[],
    };
    let frame = 0;
    let lastT = Number.NEGATIVE_INFINITY;
    const step = WINDOW_SECONDS / CAPACITY;
    const clear = () => {
      series.aNn.length = 0;
      series.aPinn.length = 0;
      series.bNn.length = 0;
      series.bPinn.length = 0;
      lastT = Number.NEGATIVE_INFINITY;
    };
    const loop = () => {
      const next = sampleRef.current();
      const timed = next.t != null && Number.isFinite(next.t);
      if (timed && next.t! + 1e-4 < lastT) clear();
      const due = !timed || series.aNn.length === 0 || next.t! >= lastT + step;
      if (due) {
        push(series.aNn, next.aNn);
        push(series.aPinn, next.aPinn);
        push(series.bNn, next.bNn);
        push(series.bPinn, next.bPinn);
        if (timed) lastT = next.t!;
      }
      draw(aRef.current, series.aNn, series.aPinn, false, smooth);
      draw(bRef.current, series.bNn, series.bPinn, logB, true);
      write(aNn.current, next.aNn, formatA);
      write(aPinn.current, next.aPinn, formatA);
      write(bNn.current, next.bNn, formatB);
      write(bPinn.current, next.bPinn, formatB);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [formatA, formatB, logB, smooth]);

  return (
    <div className="grid gap-3">
      <Spark title={aLabel} canvasRef={aRef} nnRef={aNn} pinnRef={aPinn} slotsReady={slotsReady} />
      <Spark title={bLabel} canvasRef={bRef} nnRef={bNn} pinnRef={bPinn} />
    </div>
  );
}

function Spark({
  title,
  canvasRef,
  nnRef,
  pinnRef,
  slotsReady,
}: {
  title: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nnRef: RefObject<HTMLElement | null>;
  pinnRef: RefObject<HTMLElement | null>;
  slotsReady?: boolean;
}) {
  const marked = slotsReady != null;
  return (
    <div>
      <p className="font-num text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
      <canvas ref={canvasRef} className="mt-1 block h-14 w-full" />
      <p className="mt-1 flex justify-between font-num text-[11px]">
        <span
          className="text-nn"
          data-testid={marked ? "slot-nn" : undefined}
          data-active={marked ? (slotsReady ? "true" : "false") : undefined}
        >
          NN <span ref={nnRef}>—</span>
        </span>
        <span
          className="text-pinn"
          data-testid={marked ? "slot-pinn" : undefined}
          data-active={marked ? (slotsReady ? "true" : "false") : undefined}
        >
          PINN <span ref={pinnRef}>—</span>
        </span>
      </p>
    </div>
  );
}

function push(series: number[], value: number) {
  series.push(value);
  if (series.length > CAPACITY) series.shift();
}

function write(node: HTMLElement | null, value: number, format: (value: number) => string) {
  if (!node) return;
  const text = Number.isFinite(value) ? format(value) : "—";
  if (node.textContent !== text) node.textContent = text;
}

function draw(
  canvas: HTMLCanvasElement | null,
  nn: number[],
  pinn: number[],
  log: boolean,
  smoothLine: boolean,
) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  const left = prepare(nn, log, smoothLine);
  const right = prepare(pinn, log, smoothLine);
  const values = [...left, ...right].filter((value) => Number.isFinite(value));
  if (values.length < 2) return;
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high - low < 1e-6) {
    low -= 0.5;
    high += 0.5;
  }
  stroke(context, left, rect.width, rect.height, low, high, NN);
  stroke(context, right, rect.width, rect.height, low, high, PINN);
}

function prepare(series: number[], log: boolean, smoothLine: boolean): number[] {
  const mapped = series.map((value) => {
    if (!Number.isFinite(value)) return Number.NaN;
    return log ? Math.log10(Math.max(value, LOG_FLOOR)) : value;
  });
  return smoothLine ? movingAverage(mapped) : mapped;
}

function movingAverage(series: number[]): number[] {
  return series.map((value, index) => {
    if (!Number.isFinite(value)) return value;
    let sum = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset++) {
      const sample = series[index + offset];
      if (sample != null && Number.isFinite(sample)) {
        sum += sample;
        count += 1;
      }
    }
    return count > 0 ? sum / count : value;
  });
}

function stroke(
  context: CanvasRenderingContext2D,
  series: number[],
  width: number,
  height: number,
  low: number,
  high: number,
  color: string,
) {
  context.beginPath();
  let moved = false;
  series.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      moved = false;
      return;
    }
    const x = (index / Math.max(1, series.length - 1)) * width;
    const y = height - 4 - ((value - low) / (high - low)) * (height - 8);
    if (!moved) {
      context.moveTo(x, y);
      moved = true;
    } else context.lineTo(x, y);
  });
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
}

function metres(value: number): string {
  return value.toFixed(3);
}

export function driftText(value: number): string {
  return value.toExponential(1);
}
