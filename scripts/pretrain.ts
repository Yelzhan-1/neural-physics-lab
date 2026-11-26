import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

process.env.TF_CPP_MIN_LOG_LEVEL ??= "2";

async function pretrainSpring(): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { DEFAULT_SPRING } = await import("../src/engine");
  const { MODEL_DT, SEED } = await import("../src/ml/constants");
  const { fitSpring, rolloutSpring } = await import("../src/ml/spring");
  const steps = 400;
  console.log(`spring pretrain ${steps} steps`);
  const fitted = await fitSpring(steps, { ...DEFAULT_SPRING }, 1);
  const root = path.resolve("public/models/spring-mass");
  await mkdir(path.join(root, "nn"), { recursive: true });
  await mkdir(path.join(root, "pinn"), { recursive: true });
  await fitted.nn.save(`file://${path.join(root, "nn")}`);
  await fitted.pinn.save(`file://${path.join(root, "pinn")}`);
  const horizon = Math.round(12 / MODEL_DT);
  const release = 0.65;
  const nnRoll = rolloutSpring(fitted.nn, fitted.params, [release, 0], horizon);
  const pinnRoll = rolloutSpring(fitted.pinn, fitted.params, [release, 0], horizon);
  await writeFile(
    path.join(root, "demo-rollout.json"),
    `${JSON.stringify({
      dt: MODEL_DT,
      release,
      stepsTrained: steps,
      nn: Array.from(nnRoll),
      pinn: Array.from(pinnRoll),
    })}\n`,
  );
  fitted.nn.dispose();
  fitted.pinn.dispose();
  console.log(`saved ${root}`);
  void SEED;
}

async function main(): Promise<void> {
  await import("@tensorflow/tfjs-node");
  const only = process.argv.slice(2);
  const want = (name: string) => only.length === 0 || only.includes(name);
  if (!want("pendulum")) {
    await pretrainSpring();
    return;
  }
  const { DEFAULT_PARAMS } = await import("../src/engine");
  const {
    DEFAULT_LAMBDA,
    DEMO_THETA1,
    DEMO_THETA2,
    MODEL_DT,
    PRETRAIN_STEPS,
    ROLLOUT_SECONDS,
    SEED,
  } = await import("../src/ml/constants");
  const { generateDataset } = await import("../src/ml/dataset");
  const { rolloutModel } = await import("../src/ml/predict");
  const { createModel, trainModel } = await import("../src/ml/train");

  const dataset = generateDataset({
    seed: SEED,
    params: { ...DEFAULT_PARAMS },
    fraction: 1,
    angleMin: 0.2,
    angleMax: 2.2,
    omegaMax: 1.2,
    restFraction: 0.5,
    testTrajectories: 1,
    testSeconds: 0.2,
  });
  const nn = createModel(SEED);
  const pinn = createModel(SEED);
  const started = Date.now();
  console.log(`pretrain ${PRETRAIN_STEPS} steps, seed ${SEED}, ${dataset.count} pairs`);
  await trainModel(nn, dataset, {
    physics: false,
    lambda: DEFAULT_LAMBDA,
    steps: PRETRAIN_STEPS,
    scheduleSeed: SEED + 50,
    onProgress: (progress) => {
      if (progress.step === 1 || progress.step % 200 === 0 || progress.step === progress.steps) {
        console.log(`nn   ${progress.step}/${progress.steps}  ${progress.dataLoss.toExponential(3)}`);
      }
    },
  });
  await trainModel(pinn, dataset, {
    physics: true,
    lambda: DEFAULT_LAMBDA,
    steps: PRETRAIN_STEPS,
    scheduleSeed: SEED + 50,
    onProgress: (progress) => {
      if (progress.step === 1 || progress.step % 200 === 0 || progress.step === progress.steps) {
        console.log(`pinn ${progress.step}/${progress.steps}  ${progress.dataLoss.toExponential(3)}`);
      }
    },
  });

  const root = path.resolve("public/models/double-pendulum");
  await mkdir(path.join(root, "nn"), { recursive: true });
  await mkdir(path.join(root, "pinn"), { recursive: true });
  await nn.save(`file://${path.join(root, "nn")}`);
  await pinn.save(`file://${path.join(root, "pinn")}`);

  const steps = Math.round(ROLLOUT_SECONDS / MODEL_DT);
  const initial = [(DEMO_THETA1 * Math.PI) / 180, (DEMO_THETA2 * Math.PI) / 180, 0, 0];
  const nnRoll = rolloutModel(nn, initial, steps, MODEL_DT);
  const pinnRoll = rolloutModel(pinn, initial, steps, MODEL_DT);
  const payload = {
    dt: MODEL_DT,
    theta1: DEMO_THETA1,
    theta2: DEMO_THETA2,
    stepsTrained: PRETRAIN_STEPS,
    seconds: ROLLOUT_SECONDS,
    nn: Array.from(nnRoll),
    pinn: Array.from(pinnRoll),
  };
  await writeFile(path.join(root, "demo-rollout.json"), `${JSON.stringify(payload)}\n`);
  await writeFile(
    path.join(root, "manifest.json"),
    `${JSON.stringify(
      {
        system: "double-pendulum",
        steps: PRETRAIN_STEPS,
        seed: SEED,
        lambda: DEFAULT_LAMBDA,
        fraction: 1,
        dt: MODEL_DT,
        hidden: [64, 64, 64],
      },
      null,
      2,
    )}\n`,
  );
  nn.dispose();
  pinn.dispose();
  console.log(`saved ${root} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (want("spring") || only.length === 0) await pretrainSpring();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
