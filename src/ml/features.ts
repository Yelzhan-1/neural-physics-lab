import { NORM } from "./constants";

/** [sin θ1, cos θ1, sin θ2, cos θ2, ω1/Ω, ω2/Ω]. Angles stay unique on the circle. */
export function featuresFromState(state: ArrayLike<number>, out?: Float32Array): Float32Array {
  const features = out ?? new Float32Array(6);
  const theta1 = state[0];
  const theta2 = state[1];
  features[0] = Math.sin(theta1);
  features[1] = Math.cos(theta1);
  features[2] = Math.sin(theta2);
  features[3] = Math.cos(theta2);
  features[4] = state[2] / NORM.omega;
  features[5] = state[3] / NORM.omega;
  return features;
}

/** Normalized state change the network is trained to match. */
export function targetFromStates(
  state: ArrayLike<number>,
  next: ArrayLike<number>,
  out?: Float32Array,
): Float32Array {
  const target = out ?? new Float32Array(4);
  target[0] = (next[0] - state[0]) / NORM.dTheta;
  target[1] = (next[1] - state[1]) / NORM.dTheta;
  target[2] = (next[2] - state[2]) / NORM.dOmega;
  target[3] = (next[3] - state[3]) / NORM.dOmega;
  return target;
}

/** Adds a normalized prediction onto `state`. */
export function applyDelta(state: ArrayLike<number>, delta: ArrayLike<number>, out?: Float64Array): Float64Array {
  const next = out ?? new Float64Array(4);
  next[0] = state[0] + delta[0] * NORM.dTheta;
  next[1] = state[1] + delta[1] * NORM.dTheta;
  next[2] = state[2] + delta[2] * NORM.dOmega;
  next[3] = state[3] + delta[3] * NORM.dOmega;
  return next;
}
