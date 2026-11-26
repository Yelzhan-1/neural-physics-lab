import { readFile, writeFile } from "node:fs/promises";

process.env.TF_CPP_MIN_LOG_LEVEL ??= "2";

/**
 * Appends system rows onto the committed pendulum results.
 * The pendulum table is left as the Step C run. Pass FULL_EXPERIMENTS=1 to
 * regenerate that table too — it takes a few minutes and replaces the numbers.
 */
async function main(): Promise<void> {
  await import("@tensorflow/tfjs-node");
  const { formatResultsMarkdown, runAllExperiments } = await import("../src/ml/experiments");
  const { formatMetric } = await import("../src/ml/results");
  const { runOrbitalExperiment } = await import("../src/ml/orbital");
  const { runProjectileExperiment } = await import("../src/ml/projectile");
  const started = Date.now();

  const raw = JSON.parse(await readFile("public/results.json", "utf8")) as {
    rows: {
      id: string;
      name: string;
      horizonSeconds: number;
      nn: { mse: number };
      pinn: { mse: number };
      winner: string;
    }[];
    takeaway: string;
    generatedAt: string;
  };

  if (process.env.FULL_EXPERIMENTS === "1") {
    const results = await runAllExperiments();
    await writeFile("public/results.json", `${JSON.stringify(results, null, 2)}\n`);
    await writeFile("RESULTS.md", formatResultsMarkdown(results));
    console.log(results.takeaway);
    return;
  }

  console.log("projectile and orbital headless rows, 5% data, leaving earlier numbers untouched");
  const extra = [...(await runProjectileExperiment()), ...(await runOrbitalExperiment())];
  const ids = new Set(extra.map((row) => row.id));
  const rows = [...raw.rows.filter((row) => !ids.has(row.id)), ...extra];
  const order = ["E1", "E2-5", "E2-10", "E3", "E4-1", "E4-3", "E4-10", "ES-2", "ES-10", "EP-2", "EP-10", "EO-2", "EO-10"];
  rows.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
  const sentence = rows
    .filter((row) => row.id.startsWith("ES") || row.id.startsWith("EP") || row.id.startsWith("EO"))
    .map(
      (row) =>
        `${row.name} at ${row.horizonSeconds}s (5% data): NN MSE ${formatMetric(row.nn.mse)}, PINN MSE ${formatMetric(row.pinn.mse)}, winner ${row.winner}`,
    )
    .join("; ");
  const base = raw.takeaway.split(" Separate fits,")[0];
  const takeaway = `${base} Separate fits, not part of the pendulum seed sweep: ${sentence}. Pendulum numbers above are unchanged from the previous run.`;
  const results = { ...raw, rows, takeaway, generatedAt: new Date().toISOString() };
  await writeFile("public/results.json", `${JSON.stringify(results, null, 2)}\n`);
  await writeFile("RESULTS.md", formatResultsMarkdown(results as never));
  console.log(`\n${takeaway}\n`);
  console.log(`appended in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const row of extra) {
    console.log(
      `${row.id.padEnd(6)} ${row.winner.padEnd(4)}  nn ${row.nn.mse.toExponential(3)}  pinn ${row.pinn.mse.toExponential(3)}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
