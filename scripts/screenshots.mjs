// Captures "/" and "/lab" at the supported breakpoints.
// Usage: start the app, then `node scripts/screenshots.mjs [baseUrl] [outDir]`.
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] ?? "http://localhost:3100";
const outDir = process.argv[3] ?? "screenshots";
const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "390", width: 390, height: 844 },
];
const pages = [
  { name: "home", path: "/" },
  { name: "lab", path: "/lab" },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.width < 500 ? 3 : 1,
  });
  const page = await context.newPage();
  for (const target of pages) {
    await page.goto(baseUrl + target.path, { waitUntil: "networkidle" });
    // Let the simulation run so the trails and the energy chart fill in.
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${outDir}/${target.name}-${viewport.name}.png` });

    // Scroll through the page so scroll-triggered sections have appeared.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += viewport.height / 2) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(350);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${outDir}/${target.name}-${viewport.name}-full.png`,
      fullPage: true,
    });
  }
  await context.close();
}
await browser.close();
