import { mkdir, writeFile } from "node:fs/promises";

process.env.TF_CPP_MIN_LOG_LEVEL ??= "2";

async function main(): Promise<void> {
  try {
    await import("@tensorflow/tfjs-node");
  } catch (error) {
    console.warn("tfjs-node unavailable, using the cpu backend.");
    console.warn(error);
    const tf = await import("@tensorflow/tfjs");
    await tf.setBackend("cpu");
    await tf.ready();
  }

  const { HEADLESS_STEPS } = await import("../src/ml/constants");
  const { runAllExperiments, formatResultsMarkdown } = await import("../src/ml/experiments");
  const started = Date.now();
  console.log(`headless budget ${HEADLESS_STEPS} steps, cosine 1e-3 → 1e-4, seeds 2026 / 7 / 42`);
  const results = await runAllExperiments({
    steps: HEADLESS_STEPS,
    onProgress: (progress) => {
      if (progress.step === 1 || progress.step % 250 === 0 || progress.step === progress.steps) {
        const name = progress.model === "nn" ? "nn  " : "pinn";
        console.log(
          `${name} ${String(progress.step).padStart(4)}/${progress.steps}  data ${progress.dataLoss.toExponential(3)}`,
        );
      }
    },
  });
  await mkdir("public", { recursive: true });
  await writeFile("public/results.json", `${JSON.stringify(results, null, 2)}\n`);
  await writeFile("RESULTS.md", formatResultsMarkdown(results));
  console.log(`\n${results.takeaway}\n`);
  console.log(`backend ${results.backend} · ${(Date.now() - started) / 1000}s`);
  for (const row of results.rows) {
    console.log(
      `${row.id.padEnd(6)} ${row.winner.padEnd(4)}  nn ${row.nn.mse.toExponential(3)}  pinn ${row.pinn.mse.toExponential(3)}  drift ${row.nn.energyDrift.toExponential(2)} / ${row.pinn.energyDrift.toExponential(2)}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
