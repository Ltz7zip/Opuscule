import { expect, test } from "@playwright/test";

const PAGES = [
  { name: "home", path: "/" },
  { name: "wiki", path: "/w/wuhai/wiki" },
  { name: "article", path: "/w/wuhai/wiki/world-overview" },
  { name: "explore", path: "/explore" },
] as const;

for (const theme of ["dark", "light"] as const) {
  for (const target of PAGES) {
    test(`${target.name} · ${theme}`, async ({ page, context, baseURL }, testInfo) => {
      await context.addCookies([
        { name: "opuscule-theme", value: theme, url: baseURL ?? "http://127.0.0.1:5174" },
      ]);
      await page.addInitScript((value) => {
        localStorage.setItem("opuscule-theme", value);
      }, theme);

      await page.goto(target.path, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);

      await expect(page).toHaveScreenshot(
        `${target.name}-${theme}-${testInfo.project.name}.png`,
        {
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.01,
        },
      );
    });
  }
}
