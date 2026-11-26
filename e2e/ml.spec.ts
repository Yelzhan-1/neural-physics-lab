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
  await expect(page.getByRole("heading", { name: "Learning from chaos." })).toBeVisible();
  await expect(page.getByText("6.1× lower error at 5% data — seed 2026")).toBeVisible();
  await expect(page.getByText("3-seed mean ≈ 3.2×")).toBeVisible();
  for (const name of ["Double pendulum", "Spring-mass", "Projectile with drag", "Orbital motion"]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Enter the Lab" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("lab physics starts immediately and training does not freeze it", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/lab");
  await expect(page.getByRole("button", { name: "Live train (~20 s)" })).toBeVisible();
  await page.getByText("More", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Use pretrained" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Spring-mass" })).toBeEnabled();

  const clock = page.locator('[data-readout="16"]');
  await expect.poll(async () => Number(await clock.textContent()), { timeout: 5_000 }).toBeGreaterThan(0.2);
  const before = Number(await clock.textContent());
  await page.waitForTimeout(400);
  expect(Number(await clock.textContent())).toBeGreaterThan(before + 0.15);

  await page.getByTestId("train-panel").getByRole("button", { name: "Quick train (≤5 s)" }).click();
  await expect(page.getByTestId("train-status")).toHaveText("training", { timeout: 20_000 });
  const during = Number(await clock.textContent());
  await page.waitForTimeout(500);
  expect(Number(await clock.textContent())).toBeGreaterThan(during + 0.15);

  await page.getByRole("switch", { name: "Robot arm view" }).click();
  await expect(page.getByTestId("pendulum-scene")).toBeVisible();
  expect(errors).toEqual([]);
});

test("spring system switches into a working lab", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/lab?system=spring");
  await expect(page.getByRole("button", { name: "Spring-mass" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("slider", { name: /Stiffness/ })).toBeVisible();
  await expect(page.getByTestId("spring-scene")).toBeVisible();
  await page.getByRole("button", { name: "Live train (~20 s)" }).click();
  await expect(page.getByTestId("train-status")).toHaveText("training", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("projectile system trains beside the physics", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/lab?system=projectile");
  await expect(page.getByRole("button", { name: "Projectile with drag" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("slider", { name: /Launch angle/ })).toBeVisible();
  await expect(page.getByRole("slider", { name: /Drag/ })).toBeVisible();
  await expect(page.getByTestId("projectile-scene")).toBeVisible();
  await page.getByRole("button", { name: "Live train (~20 s)" }).click();
  await expect(page.getByTestId("train-status")).toHaveText("training", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("orbital system trains beside the physics", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/lab?system=orbital");
  await expect(page.getByRole("button", { name: "Orbital motion" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("slider", { name: /Radius/ })).toBeVisible();
  await expect(page.getByRole("slider", { name: /Initial speed/ })).toBeVisible();
  await expect(page.getByTestId("orbital-scene")).toBeVisible();
  await page.getByRole("button", { name: "Live train (~20 s)" }).click();
  await expect(page.getByTestId("train-status")).toHaveText("training", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("challenge mode can reveal a winner", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto("/lab");
  await page.getByText("More", { exact: true }).click();
  const guess = page.getByRole("button", { name: "PINN will be closer" });
  if (!(await guess.isVisible())) {
    await page.getByTestId("train-panel").getByRole("button", { name: "Quick train (≤5 s)" }).click();
  }
  await expect(guess).toBeVisible({ timeout: 70_000 });
  await guess.click();
  await expect(page.getByTestId("challenge-reveal")).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("demo mode shows NN and PINN rollouts within 3 seconds", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/lab?demo=1", { waitUntil: "commit" });
  await expect(page.getByTestId("slot-nn")).toHaveAttribute("data-active", "true", { timeout: 3_000 });
  await expect(page.getByTestId("slot-pinn")).toHaveAttribute("data-active", "true", { timeout: 3_000 });
  await expect(page.getByText("Pretrained · 1300 steps")).toBeVisible();
  expect(errors).toEqual([]);
});

test("qr page shows a code for the live site", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/qr");
  await expect(page.getByRole("img", { name: /QR code for/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "neural-physics-lab-roan.vercel.app" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("experiments page shows computed results and can export them", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/experiments");
  await page.getByText("All runs", { exact: true }).click();
  const table = page.getByTestId("results-table");
  await expect(table).toContainText("Standard conditions");
  await expect(table).toContainText("Limited training data");
  await expect(table).toContainText("Unseen initial conditions");
  await expect(table).toContainText("Long-term prediction");
  await expect(table.getByText("PINN").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Export results (JSON)" })).toBeEnabled();
  await page.getByText("Re-run", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Re-run Standard conditions live" })).toBeEnabled();
  expect(errors).toEqual([]);
});
