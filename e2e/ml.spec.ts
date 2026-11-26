import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("landing describes the four experiments and the trainable models", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.getByText("Not trained yet")).toHaveCount(0);
  await expect(page.getByText("Model training arrives in the lab next")).toHaveCount(0);
  for (const name of [
    "Standard conditions",
    "Limited training data",
    "Unseen initial conditions",
    "Long-term prediction",
  ]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByText("Trains in your browser").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("lab training starts in a worker while the simulation clock keeps moving", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/lab");
  await expect(page.getByRole("button", { name: "Train models" })).toBeVisible();
  await expect(page.getByTestId("train-status")).toHaveText("idle");
  await expect(page.getByRole("button", { name: "Spring-mass" })).toBeDisabled();

  await page.getByRole("button", { name: "Train models" }).click();
  await expect(page.getByTestId("train-status")).toHaveText("training", { timeout: 20_000 });

  const clock = page.locator('[data-readout="16"]');
  await expect.poll(async () => Number(await clock.textContent()), { timeout: 5_000 }).toBeGreaterThan(0.2);
  const before = Number(await clock.textContent());
  await page.waitForTimeout(700);
  expect(Number(await clock.textContent())).toBeGreaterThan(before + 0.2);

  await page.getByRole("switch", { name: "Robot arm view" }).click();
  await expect(page.getByTestId("pendulum-scene")).toBeVisible();
  expect(errors).toEqual([]);
});

test("experiments page shows computed results and can export them", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/experiments");
  const table = page.getByTestId("results-table");
  await expect(table).toContainText("Standard conditions");
  await expect(table).toContainText("Limited training data");
  await expect(table).toContainText("Unseen initial conditions");
  await expect(table).toContainText("Long-term prediction");
  await expect(table.getByText("PINN").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Export results (JSON)" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Re-run Standard conditions live" })).toBeEnabled();
  expect(errors).toEqual([]);
});
