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

  const { runAllExperiments, formatResultsMarkdown } = await import("../src/ml/experiments");
  const started = Date.now();
  const results = await runAllExperiments({
    onProgress: (progress) => {
      if (progress.step === 1 || progress.step % 40 === 0 || progress.step === progress.steps) {
        const name = progress.model === "nn" ? "nn  " : "pinn";
        console.log(
          `${name} ${String(progress.step).padStart(3)}/${progress.steps}  data ${progress.dataLoss.toExponential(3)}`,
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
