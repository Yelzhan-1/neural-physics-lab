# src/ml

Reserved for Step B. Nothing here is implemented yet.

Step B adds in-browser training (TensorFlow.js in a Web Worker) of two models:

- **Standard NN**: learns the motion from data only.
- **PINN**: the same network with the equations of motion from `src/engine` in its loss.

## Contract with the scene

The scene already accepts model output. A model produces a `Trajectory` (see `src/engine/types.ts`):

```ts
interface Trajectory {
  states: Float32Array; // [theta1, theta2, omega1, omega2] per sample
  dt: number;           // seconds between samples, first sample at t = 0
}
```

Pass it to the slot with the matching id (`"nn"` or `"pinn"`) through the `trajectories` prop of `PendulumScene`. While a slot has no trajectory, the scene shows "Model not trained yet".
