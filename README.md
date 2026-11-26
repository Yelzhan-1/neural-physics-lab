# Neural Physics Lab

Physics-informed AI vs a standard neural network on a double pendulum, in the browser. KIMEP AI Challenge 2026.

The question: **does AI predict motion better when it learns the laws of physics, not only data?** The test system is a double pendulum, which is the same mathematics as a two-link robot arm.

## Status

| Step | Scope | State |
| --- | --- | --- |
| A | Scaffold, physics engine, scene, lab, landing | Done |
| B | In-browser training of a Standard NN and a PINN (TensorFlow.js in a Web Worker) | Done |

`/lab` trains both models in a worker. `/experiments` shows the four comparisons. Precomputed numbers live in `public/results.json` and `RESULTS.md`; they are whatever `pnpm experiments` last wrote.

## Run it

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `pnpm build` | Production build (static, deployable to Vercel as is) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Generates route types, then `tsc --noEmit` |
| `pnpm test` | Vitest unit tests (physics engine, scene runtime, dataset, physics residual) |
| `pnpm test:e2e` | Playwright smoke test of `/`, `/lab` and `/experiments`. First run: `pnpm exec playwright install chromium` |
| `pnpm experiments` | Train both models headlessly and rewrite `public/results.json` and `RESULTS.md` |

Everything runs client-side. There is no backend, no API key and no `.env`.

## Layout

```
src/engine/            Physics, pure TypeScript, no React or DOM
src/ml/                Dataset, PINN residual, worker training, experiments
src/components/scene/  Canvas renderers and the simulation runtime
src/components/lab/    Controls and physics panel of /lab
src/components/landing Landing page sections
src/components/site/   Header, backdrop, glass card
src/components/ui/     shadcn/ui components
src/app/               "/" (landing) and "/lab" (simulator)
e2e/                   Playwright smoke test
scripts/               Screenshot helpers
```

## Physics engine (`src/engine`)

Written from scratch, no physics library.

- State is `[theta1, theta2, omega1, omega2]`, angles measured from the downward vertical.
- Equations of motion come from the Lagrangian and are solved through the 2x2 mass matrix: `M(theta) * alpha = f(theta, omega)`. The derivation is in the header of `doublePendulum.ts`.
- Parameters: `m1, m2, l1, l2, g, damping` (damping defaults to 0).
- Integrator: classical RK4 with a fixed step, `dt = 1/240 s`. The hot path does not allocate.

```ts
import { DEFAULT_PARAMS, derivatives, energy, kinematics, rk4Step, simulate } from "@/engine";

const state = [2.1, -0.35, 0, 0];
derivatives(state, DEFAULT_PARAMS);          // [omega1, omega2, alpha1, alpha2]
rk4Step(state, DEFAULT_PARAMS);              // next state after 1/240 s
simulate(state, DEFAULT_PARAMS, 4800);       // Float32Array, 4801 states of 4 numbers
energy(state, DEFAULT_PARAMS);               // { kinetic, potential, total }
kinematics(state, DEFAULT_PARAMS);           // positions, velocities, accelerations of both bobs
```

What the tests check:

- Relative total-energy drift below `1e-4` over 20 s at `dt = 1/240` for four initial conditions, including a chaotic one.
- Small-angle normal-mode frequencies within 1% of the linearised analytic values.
- Bit-identical trajectories for identical inputs.
- Fourth-order convergence of the integrator, and kinematics against finite differences.

## Scene (`src/components/scene`)

- `LabRuntime` owns the clock. It integrates the physics slot live and replays a trajectory for every other slot against the same clock.
- `PendulumScene` is a canvas view of a runtime: glow trails, side-by-side or overlay layout, pendulum or robot-arm view, bobs draggable with the pointer.
- `EnergyChart` plots kinetic, potential and total energy from the runtime's ring buffer.

### Feeding a model prediction (Step B)

```ts
runtime.setTrajectory("pinn", { states, dt });   // states: Float32Array, 4 numbers per sample
runtime.setTrajectory("pinn", null);             // back to "Model not trained yet"
```

The trajectory must start at `t = 0` from the runtime's current release pose. Past its last sample the slot holds its final state.
