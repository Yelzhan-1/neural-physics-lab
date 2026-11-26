export const NARROW_MQ = "(max-width: 699px)";

export interface LaneFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Side by side on a wide viewport. Under 700px the physics lane is full width
 * and the two models sit beside each other underneath it.
 */
export function laneFrames(count: number, width: number, height: number, stacked: boolean): LaneFrame[] {
  if (stacked && count === 3) {
    const split = Math.round(height * 0.58);
    const lower = height - split;
    return [
      { left: 8, top: 6, width: width - 16, height: Math.max(40, split - 30) },
      { left: 8, top: split + 6, width: width / 2 - 16, height: Math.max(40, lower - 32) },
      { left: width / 2 + 8, top: split + 6, width: width / 2 - 16, height: Math.max(40, lower - 32) },
    ];
  }
  const laneW = width / Math.max(1, count);
  return Array.from({ length: count }, (_, index) => ({
    left: laneW * index + 8,
    top: 8,
    width: laneW - 16,
    height: Math.max(40, height - 36),
  }));
}

export function strokeLaneDividers(
  context: CanvasRenderingContext2D,
  count: number,
  width: number,
  height: number,
  stacked: boolean,
) {
  context.strokeStyle = "rgba(237,230,218,0.10)";
  context.lineWidth = 1;
  context.beginPath();
  if (stacked && count === 3) {
    const split = Math.round(height * 0.58);
    context.moveTo(12, split + 0.5);
    context.lineTo(width - 12, split + 0.5);
    context.moveTo(width / 2 + 0.5, split + 8);
    context.lineTo(width / 2 + 0.5, height - 12);
  } else {
    for (let index = 1; index < count; index++) {
      const x = Math.round((width / count) * index) + 0.5;
      context.moveTo(x, 12);
      context.lineTo(x, height - 12);
    }
  }
  context.stroke();
}

/** Hard clip, then fade the rim so a line that still leaves the lane dissolves instead of ending in a cut. */
export function paintLane(
  context: CanvasRenderingContext2D,
  frame: LaneFrame,
  draw: () => void,
) {
  context.save();
  context.beginPath();
  context.rect(frame.left, frame.top, frame.width, frame.height);
  context.clip();
  draw();
  const band = Math.min(14, frame.width * 0.07, frame.height * 0.07);
  if (band > 2) {
    context.globalCompositeOperation = "destination-out";
    fadeEdge(context, frame.left, frame.top, band, frame.height, frame.left, 0, frame.left + band, 0);
    fadeEdge(
      context,
      frame.left + frame.width - band,
      frame.top,
      band,
      frame.height,
      frame.left + frame.width,
      0,
      frame.left + frame.width - band,
      0,
    );
    fadeEdge(context, frame.left, frame.top, frame.width, band, 0, frame.top, 0, frame.top + band);
    fadeEdge(
      context,
      frame.left,
      frame.top + frame.height - band,
      frame.width,
      band,
      0,
      frame.top + frame.height,
      0,
      frame.top + frame.height - band,
    );
  }
  context.restore();
}

function fadeEdge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const gradient = context.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, "rgba(0,0,0,0.85)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
}
