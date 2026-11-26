# Experiment results

On the full dataset PINN has the lower rollout MSE (1.679 against 4.111); with 5% of the data the PINN rollout MSE is 6.1× lower, and on large angles held out of training PINN wins. By 10 s both errors have grown (standard NN ×14, PINN ×11 from 1 s), which a chaotic pendulum is expected to do. Across seeds 2026, 7, 42, E1 PINN MSE is 2.397 ± 0.682 (standard NN 2.946 ± 1.189) and the 5% PINN MSE is 5.983 ± 3.114 (standard NN 19.077 ± 26.839).

Generated 2026-11-26T17:35:25.586Z on the `tensorflow` backend.
Seed 2026, dt 0.02 s, hidden layers [64, 64, 64], 1300 optimizer steps, batch 64, learning rate 0.001 cosine to 0.0001, λ 0.4.
RK4 reference speed: 1.91e-3 ms per model step.

MSE and MAE are the mean squared and mean absolute error of the state error (Δθ₁, Δθ₂, Δω₁, Δω₂). Angles are in radians and angular velocities are in rad/s, averaged over those four components and over the rollout after t = 0.
Energy drift is relative: |E(T) − E(0)| / |E(0)|, using the model's own total energy at the start and end of the horizon.

Errors are autoregressive rollout error against RK4, not one-step error. The winner is the lower rollout MSE. A gap under 2% is a tie.

| Experiment | Setting | Horizon | Train pairs | NN MSE | PINN MSE | NN MAE | PINN MAE | NN \|ΔE\|/\|E0\| | PINN \|ΔE\|/\|E0\| | NN ms/step | PINN ms/step | Winner |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Standard conditions | 100% of the data, held-out trajectories | 2 s | 1200 | 4.111 | 1.679 | 1.171 | 0.797 | 0.544 | 0.195 | 0.339 | 0.341 | PINN |
| Limited training data | 5% of the data, same held-out trajectories | 2 s | 60 | 50.051 | 8.227 | 2.650 | 1.216 | 17.097 | 1.797 | 0.296 | 0.321 | PINN |
| Limited training data | 10% of the data, same held-out trajectories | 2 s | 120 | 7.475 | 5.175 | 1.587 | 0.958 | 0.469 | 0.388 | 0.300 | 0.326 | PINN |
| Unseen initial conditions | trained on small angles, tested on large angles | 2 s | 1200 | 11.153 | 7.382 | 2.201 | 1.489 | 0.277 | 0.377 | 0.300 | 0.320 | PINN |
| Long-term prediction | full data, error over 1 s | 1 s | 1200 | 1.474 | 0.678 | 0.727 | 0.517 | 0.222 | 0.148 | 0.339 | 0.341 | PINN |
| Long-term prediction | full data, error over 3 s | 3 s | 1200 | 10.388 | 2.596 | 1.747 | 0.956 | 0.798 | 0.170 | 0.339 | 0.341 | PINN |
| Long-term prediction | full data, error over 10 s | 10 s | 1200 | 19.972 | 7.610 | 2.626 | 1.609 | 0.774 | 0.520 | 0.339 | 0.341 | PINN |

Seed sweep, same budget, sample standard deviation (n − 1):

| Run | Seeds | NN MSE | PINN MSE | NN \|ΔE\|/\|E0\| | PINN \|ΔE\|/\|E0\| |
| --- | --- | --- | --- | --- | --- |
| Standard conditions | 2026, 7, 42 | 2.946 ± 1.189 | 2.397 ± 0.682 | 0.377 ± 0.213 | 0.211 ± 0.032 |
| Limited data, 5% | 2026, 7, 42 | 19.077 ± 26.839 | 5.983 ± 3.114 | 6.233 ± 9.421 | 1.009 ± 0.690 |
