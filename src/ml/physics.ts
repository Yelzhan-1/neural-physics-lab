import * as tf from "@tensorflow/tfjs";
import type { PendulumParams } from "../engine";
import { DERIV_SCALE, ENERGY_WEIGHT } from "./constants";

/**
 * Analytic state derivative [ω1, ω2, α1, α2], the same 2×2 mass-matrix solve
 * as `derivatives` in src/engine, written with tf ops so a loss can differentiate
 * through it. `state` is [batch, 4].
 */
export function derivativesTensor(state: tf.Tensor2D, params: PendulumParams): tf.Tensor2D {
  const { m1, m2, l1, l2, g, damping } = params;
  const [theta1, theta2, omega1, omega2] = tf.split(state, 4, 1);
  const delta = theta1.sub(theta2);
  const sinD = tf.sin(delta);
  const cosD = tf.cos(delta);
  const mTotal = m1 + m2;
  const m11 = mTotal * l1 * l1;
  const m22 = m2 * l2 * l2;
  const m12 = cosD.mul(m2 * l1 * l2);
  const coupling = sinD.mul(m2 * l1 * l2);

  const f1 = coupling
    .mul(omega2.square())
    .mul(-1)
    .sub(tf.sin(theta1).mul(mTotal * g * l1))
    .sub(omega1.mul(damping));
  const f2 = coupling
    .mul(omega1.square())
    .sub(tf.sin(theta2).mul(m2 * g * l2))
    .sub(omega2.mul(damping));

  const det = m12.square().mul(-1).add(m11 * m22);
  const alpha1 = f1.mul(m22).sub(m12.mul(f2)).div(det);
  const alpha2 = f2.mul(m11).sub(m12.mul(f1)).div(det);
  return tf.concat([omega1, omega2, alpha1, alpha2], 1) as tf.Tensor2D;
}

/** Total mechanical energy in joules, shape [batch, 1]. Potential is zero at rest. */
export function energyTensor(state: tf.Tensor2D, params: PendulumParams): tf.Tensor2D {
  const { m1, m2, l1, l2, g } = params;
  const [theta1, theta2, omega1, omega2] = tf.split(state, 4, 1);
  const mTotal = m1 + m2;
  const kinetic = omega1
    .square()
    .mul(0.5 * mTotal * l1 * l1)
    .add(omega2.square().mul(0.5 * m2 * l2 * l2))
    .add(omega1.mul(omega2).mul(tf.cos(theta1.sub(theta2))).mul(m2 * l1 * l2));
  const potential = tf
    .cos(theta1)
    .mul(-1)
    .add(1)
    .mul(mTotal * g * l1)
    .add(tf.cos(theta2).mul(-1).add(1).mul(m2 * g * l2));
  return kinetic.add(potential) as tf.Tensor2D;
}

/**
 * Predicted (s_{t+dt} − s_t) / dt minus the analytic derivative at the midpoint.
 * Shape [batch, 4]. A step that agrees with the equations of motion is near zero;
 * the leftover is the midpoint-rule truncation, which shrinks with dt.
 */
export function physicsResidual(
  state: tf.Tensor2D,
  next: tf.Tensor2D,
  params: PendulumParams,
  dt: number,
): tf.Tensor2D {
  const mid = state.add(next).mul(0.5) as tf.Tensor2D;
  const predicted = next.sub(state).div(dt);
  const analytic = derivativesTensor(mid, params);
  return predicted.sub(analytic);
}

/**
 * Scalar physics loss: mean squared scaled residual, plus a relative energy
 * penalty. With zero damping the penalty is energy conservation. With damping
 * the expected change is the dissipative power −c (ω1² + ω2²) over the step.
 */
export function physicsPenalty(
  state: tf.Tensor2D,
  next: tf.Tensor2D,
  params: PendulumParams,
  dt: number,
): tf.Scalar {
  const residual = physicsResidual(state, next, params, dt);
  const scale = tf.tensor1d(DERIV_SCALE as unknown as number[]);
  const residualTerm = residual.div(scale).square().mean();

  const mid = state.add(next).mul(0.5);
  const omega1 = mid.slice([0, 2], [-1, 1]);
  const omega2 = mid.slice([0, 3], [-1, 1]);
  const dissipated = omega1.square().add(omega2.square()).mul(params.damping * dt);
  const e0 = energyTensor(state, params);
  const e1 = energyTensor(next, params);
  const gap = e1.sub(e0).add(dissipated);
  const relative = gap.div(e0.abs().maximum(tf.scalar(1)));
  const energyTerm = relative.mul(ENERGY_WEIGHT).square().mean();
  return residualTerm.add(energyTerm) as tf.Scalar;
}
