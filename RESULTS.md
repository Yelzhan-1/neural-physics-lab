# Experiment results

On the full dataset PINN has the lower rollout MSE (3.305 against 5.343); with 5% of the data the PINN rollout MSE is 10.2× lower, and on large angles held out of training PINN wins. By 10 s both errors have grown (standard NN ×33, PINN ×8 from 1 s), which a chaotic pendulum is expected to do.

Generated 2026-11-26T17:06:43.615Z on the `tensorflow` backend.
Seed 2026, dt 0.02 s, hidden layers [64, 64, 64], 200 optimizer steps, batch 64, learning rate 0.001, λ 0.4.
RK4 reference speed: 1.93e-3 ms per model step.

Errors are autoregressive rollout error against RK4, not one-step error. The winner is the lower rollout MSE. A gap under 2% is a tie.

| Experiment | Setting | Horizon | Train pairs | NN MSE | PINN MSE | NN MAE | PINN MAE | NN energy drift | PINN energy drift | NN ms/step | PINN ms/step | Winner |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Standard conditions | 100% of the data, held-out trajectories | 2 s | 1200 | 5.343 | 3.305 | 1.401 | 1.128 | 0.351 | 0.658 | 0.330 | 0.325 | PINN |
| Limited training data | 5% of the data, same held-out trajectories | 2 s | 60 | 44.429 | 4.356 | 2.926 | 1.129 | 16.145 | 1.233 | 0.291 | 0.319 | PINN |
| Limited training data | 10% of the data, same held-out trajectories | 2 s | 120 | 11.491 | 5.880 | 1.855 | 1.476 | 1.079 | 0.455 | 0.286 | 0.307 | PINN |
| Unseen initial conditions | trained on small angles, tested on large angles | 2 s | 1200 | 10.173 | 2.800 | 2.079 | 1.208 | 0.355 | 0.481 | 0.328 | 0.288 | PINN |
| Long-term prediction | full data, error over 1 s | 1 s | 1200 | 1.176 | 0.869 | 0.674 | 0.562 | 0.334 | 0.381 | 0.330 | 0.325 | PINN |
| Long-term prediction | full data, error over 3 s | 3 s | 1200 | 11.850 | 5.305 | 1.832 | 1.396 | 0.648 | 0.610 | 0.330 | 0.325 | PINN |
| Long-term prediction | full data, error over 10 s | 10 s | 1200 | 39.134 | 7.118 | 3.200 | 1.813 | 3.640 | 1.441 | 0.330 | 0.325 | PINN |
