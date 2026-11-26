import { expect, test, type Page } from "@playwright/test";

/** Counts canvas pixels that are not fully transparent. */
async function paintedPixels(page: Page, testId: string): Promise<number> {
  return page.getByTestId(testId).first().evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) painted++;
    return painted;
  });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("landing shows the headline and a live pendulum canvas", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Learning from chaos." })).toBeVisible();
  await expect(page.getByTestId("pendulum-scene").first()).toBeVisible();
  await expect.poll(() => paintedPixels(page, "pendulum-scene")).toBeGreaterThan(500);

  await page.getByRole("link", { name: "Enter the Lab" }).first().click();
  await expect(page).toHaveURL(/\/lab$/);
  expect(errors).toEqual([]);
});

test("lab renders the scene, the controls and a moving simulation", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/lab");

  const scene = page.getByTestId("pendulum-scene");
  await expect(scene).toBeVisible();
  await expect.poll(() => paintedPixels(page, "pendulum-scene")).toBeGreaterThan(500);
  await page.getByText("Physics readout", { exact: true }).click();
  await expect(page.getByTestId("energy-chart")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.locator("summary", { hasText: "Sandbox" }).click();
  await expect(page.getByRole("heading", { name: "Sandbox" })).toBeVisible();

  // The clock readout advances while the simulation plays.
  const clock = page.locator('[data-readout="16"]');
  await expect.poll(async () => Number(await clock.textContent())).toBeGreaterThan(0.2);

  // Pausing freezes it.
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  // The readout refreshes at 10 Hz, so let its last update land before sampling.
  await page.waitForTimeout(300);
  const frozen = await clock.textContent();
  await page.waitForTimeout(500);
  expect(await clock.textContent()).toBe(frozen);
  expect(errors).toEqual([]);
});
