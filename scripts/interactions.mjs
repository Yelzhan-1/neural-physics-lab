// Exercises the lab controls and saves a screenshot of each state.
// Usage: node scripts/interactions.mjs [baseUrl] [outDir]
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] ?? "http://localhost:3100";
const outDir = process.argv[3] ?? "screenshots";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${baseUrl}/lab`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

await page.getByRole("switch", { name: "Robot arm view" }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/lab-arm.png` });

await page.getByRole("radio", { name: "Overlay" }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/lab-overlay-arm.png` });

await page.getByRole("switch", { name: "Robot arm view" }).click();
await page.getByRole("radio", { name: "Side by side" }).click();
await page.getByRole("button", { name: "Pause" }).click();
await page.getByRole("button", { name: "Reset" }).click();
await page.waitForTimeout(300);

// Drag the second bob: read its position from the clock-independent readouts.
const readout = async (index) =>
  Number((await page.locator(`[data-readout="${index}"]`).textContent()).replace("−", "-"));
const before = { x: await readout(2), y: await readout(3) };
const box = await page.getByTestId("pendulum-scene").boundingBox();
// Search the physics cell for the bob by hovering until the cursor turns to "grab".
let grabbed = null;
for (let y = box.y + 20; y < box.y + box.height && !grabbed; y += 12) {
  for (let x = box.x + 20; x < box.x + box.width * 0.45; x += 12) {
    await page.mouse.move(x, y);
    const cursor = await page.getByTestId("pendulum-scene").evaluate((el) => el.style.cursor);
    if (cursor === "grab") {
      grabbed = { x, y };
      break;
    }
  }
}
if (!grabbed) throw new Error("No grabbable bob found");
await page.mouse.down();
await page.mouse.move(grabbed.x + 60, grabbed.y + 90, { steps: 8 });
await page.waitForTimeout(200);
await page.screenshot({ path: `${outDir}/lab-dragging.png` });
await page.mouse.up();
await page.waitForTimeout(300);
const after = { x: await readout(2), y: await readout(3) };
const sliders = await page.locator('[data-slot="slider"]').count();
console.log(JSON.stringify({ grabbed, before, after, sliders }));
await browser.close();
