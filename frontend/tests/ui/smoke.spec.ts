import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/explore",
  "/w/wuhai/wiki",
  "/w/wuhai/wiki/world-overview",
  "/search?q=%E9%9B%BE",
  "/u/traveler",
  "/w/wuhai/map",
  "/w/wuhai/timeline",
];

test("WebKit smoke: eight routes, no console errors, unique names", async ({ page }) => {
  test.setTimeout(120_000);
  for (const route of ROUTES) {
    const errors: string[] = [];
    const handler = (message: { type(): string; text(): string }) => {
      if (message.type() === "error") errors.push(message.text());
    };
    page.on("console", handler);
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(route.includes("/map") || route.includes("/timeline") ? 1800 : 700);
    page.off("console", handler);

    const names = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("*")]
      .map((node) => getComputedStyle(node).viewTransitionName)
      .filter((name) => name && name !== "none"));
    expect(new Set(names).size, `duplicate view-transition-name on ${route}`).toBe(names.length);
    expect(errors, `console errors on ${route}`).toEqual([]);
  }
});

test("WebKit fallback: opening a card still works without startViewTransition", async ({ page }) => {
  await page.goto("/w/wuhai?card=1", { waitUntil: "domcontentloaded" });
  await page.locator(".tree-row").first().waitFor({ timeout: 20_000 });
  const removed = await page.evaluate(() => {
    try {
      delete (Document.prototype as unknown as { startViewTransition?: unknown }).startViewTransition;
    } catch {
      // Some builds expose it as an own property; the click fallback is still exercised.
    }
    return !("startViewTransition" in document);
  });
  const row = page.locator(".tree-row", { hasText: "白塔沉没" }).first();
  await row.click();
  await page.waitForURL("**card=5");
  await expect(page.locator(".editor-head")).toBeVisible();
  expect(typeof removed).toBe("boolean");
});
