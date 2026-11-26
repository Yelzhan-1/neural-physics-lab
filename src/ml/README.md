# src/ml

In-browser training of two models that map the double-pendulum state `s_t = (θ1, θ2, ω1, ω2)` to `s_{t+dt}`.

- **Standard NN**: a 3×64 tanh MLP. Loss is the mean squared error of the normalized state change.
- **PINN**: the same MLP and the same minibatches, plus `λ` times a physics residual. The residual compares `(s_{t+dt} − s_t) / dt` with the analytic derivative at the midpoint, written in TensorFlow.js ops, and adds a relative energy penalty. Unlabeled collocation states are drawn from random angles and angular velocities, so the PINN sees the equations even when the labeled set is small.

Both models are created from the same seed and trained in a Web Worker (`worker.ts`) on the WebGL backend, falling back to CPU. `pnpm experiments` runs the same code under `@tensorflow/tfjs-node` and writes `public/results.json` and `RESULTS.md`.

Angles enter the network as sin/cos. A prediction is rolled out autoregressively and handed to the scene as a `Trajectory`.

## Contract with the scene

```ts
interface Trajectory {
  states: Float32Array; // [theta1, theta2, omega1, omega2] per sample
  dt: number;           // seconds between samples, first sample at t = 0
}
```

Pass it to the slot with the matching id (`"nn"` or `"pinn"`) through `runtime.setTrajectory` or `runtime.setTrajectories`. While a slot has no trajectory, the scene shows "Model not trained yet". In the robot-arm view that placeholder is drawn as an arm, not a pendulum.
