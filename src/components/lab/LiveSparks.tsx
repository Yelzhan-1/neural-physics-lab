"use client";

import { useEffect, useRef, type RefObject } from "react";

const NN = "#ff6a3d";
const PINN = "#c8f04a";
const CAPACITY = 160;

export interface SparkSample {
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
}: {
  aLabel: string;
  bLabel: string;
  sample: () => SparkSample;
  formatA?: (value: number) => string;
  formatB?: (value: number) => string;
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
    const loop = () => {
      const next = sampleRef.current();
      push(series.aNn, next.aNn);
      push(series.aPinn, next.aPinn);
      push(series.bNn, next.bNn);
      push(series.bPinn, next.bPinn);
      draw(aRef.current, series.aNn, series.aPinn);
      draw(bRef.current, series.bNn, series.bPinn);
      write(aNn.current, next.aNn, formatA);
      write(aPinn.current, next.aPinn, formatA);
      write(bNn.current, next.bNn, formatB);
      write(bPinn.current, next.bPinn, formatB);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [formatA, formatB]);

  return (
    <div className="grid gap-3">
      <Spark title={aLabel} canvasRef={aRef} nnRef={aNn} pinnRef={aPinn} />
      <Spark title={bLabel} canvasRef={bRef} nnRef={bNn} pinnRef={bPinn} />
    </div>
  );
}

function Spark({
  title,
  canvasRef,
  nnRef,
  pinnRef,
}: {
  title: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nnRef: RefObject<HTMLElement | null>;
  pinnRef: RefObject<HTMLElement | null>;
}) {
  return (
    <div>
      <p className="font-num text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
      <canvas ref={canvasRef} className="mt-1 block h-14 w-full" />
      <p className="mt-1 flex justify-between font-num text-[11px]">
        <span className="text-nn">
          NN <span ref={nnRef}>—</span>
        </span>
        <span className="text-pinn">
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

function draw(canvas: HTMLCanvasElement | null, nn: number[], pinn: number[]) {
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
  const values = [...nn, ...pinn].filter((value) => Number.isFinite(value));
  if (values.length < 2) return;
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high - low < 1e-6) {
    low -= 0.5;
    high += 0.5;
  }
  stroke(context, nn, rect.width, rect.height, low, high, NN);
  stroke(context, pinn, rect.width, rect.height, low, high, PINN);
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
  context.lineWidth = 1.4;
  context.stroke();
}

function metres(value: number): string {
  return value.toFixed(3);
}

export function driftText(value: number): string {
  return value.toExponential(1);
}
