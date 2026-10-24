import { expect, test } from "@playwright/test";

/**
 * Shared-element contract.
 *
 * The browser's implicit root name ("root") is excluded: it is not a name the
 * app assigns. Every name the app assigns starts with `vt-`, and a document
 * may contain at most two of them (one primary + one chip / persistent mark).
 */
const ROUTES = [
  { name: "home", path: "/" },
  { name: "explore", path: "/explore" },
  { name: "wiki", path: "/w/wuhai/wiki" },
  { name: "article", path: "/w/wuhai/wiki/world-overview" },
  { name: "search", path: "/search?q=%E9%9B%BE" },
  { name: "profile", path: "/u/traveler" },
  { name: "map", path: "/w/wuhai/map" },
  { name: "timeline", path: "/w/wuhai/timeline" },
] as const;

async function settle(page: import("@playwright/test").Page, selector?: string) {
  if (selector) await page.locator(selector).first().waitFor({ state: "attached", timeout: 15_000 });
  await page.waitForTimeout(600);
}

async function appNames(page: import("@playwright/test").Page) {
  return page.$$eval("*", (elements) =>
    elements
      .map((element) => getComputedStyle(element).viewTransitionName)
      .filter((name) => name && name !== "none" && name.startsWith("vt-")),
  );
}

function watchTransitionErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Transition was aborted")) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function nameOf(page: import("@playwright/test").Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => getComputedStyle(element).viewTransitionName);
}

async function classOf(page: import("@playwright/test").Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => getComputedStyle(element).viewTransitionClass);
}

for (const route of ROUTES) {
  test(`${route.name}: at most two unique app names, none on canvas/video`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "opuscule-theme", value: "dark", url: baseURL ?? "http://127.0.0.1:5174" }]);
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await settle(page, route.name === "map" ? ".map-canvas" : route.name === "timeline" ? ".timeline-canvas-shell" : undefined);

    const names = await appNames(page);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeLessThanOrEqual(2);

    const namedMedia = await page.$$eval("canvas, video", (elements) =>
      elements
        .map((element) => getComputedStyle(element).viewTransitionName)
        .filter((name) => name && name !== "none"),
    );
    expect(namedMedia).toEqual([]);
  });
}

test("grid: only the hovered tile leaf gets a name", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "opuscule-theme", value: "dark", url: baseURL ?? "http://127.0.0.1:5174" }]);
  await page.goto("/explore", { waitUntil: "domcontentloaded" });
  await settle(page, ".site-tile");
  expect(await appNames(page)).toEqual([]);

  await page.locator(".site-tile").first().hover();
  const names = await appNames(page);
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^vt-cover-/);
  expect(await classOf(page, ".site-tile-cover")).toBe("cover");
});

test("explore cover -> wiki hero cover", async ({ page, context, baseURL }) => {
  const transitionErrors = watchTransitionErrors(page);
  await context.addCookies([{ name: "opuscule-theme", value: "dark", url: baseURL ?? "http://127.0.0.1:5174" }]);
  await page.goto("/explore", { waitUntil: "domcontentloaded" });
  await settle(page, ".site-tile");
  await page.locator(".site-tile").first().hover();
  const source = await nameOf(page, ".site-tile-cover");
  const sourceClass = await classOf(page, ".site-tile-cover");
  expect(source).toMatch(/^vt-cover-/);
  expect(sourceClass).toBe("cover");

  await page.locator(".site-tile").first().click();
  await page.waitForURL("**/wiki");
  await settle(page, ".site-hero-cover");
  expect(await nameOf(page, ".site-hero-cover")).toBe(source);
  expect(await classOf(page, ".site-hero-cover")).toBe(sourceClass);
  expect(transitionErrors).toEqual([]);
});

test("home tile cover -> article cover", async ({ page, context, baseURL }) => {
  const transitionErrors = watchTransitionErrors(page);
  await context.addCookies([{ name: "opuscule-theme", value: "dark", url: baseURL ?? "http://127.0.0.1:5174" }]);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await settle(page, ".site-tile");
  await page.locator(".site-tile").first().hover();
  const source = await nameOf(page, ".site-tile-cover");
  const sourceClass = await classOf(page, ".site-tile-cover");
  expect(source).toMatch(/^vt-cover-/);
  expect(sourceClass).toBe("cover");

  await page.locator(".site-tile").first().click();
  await page.waitForURL("**/wiki/**");
  await settle(page, ".site-page-cover");
  expect(await nameOf(page, ".site-page-cover")).toBe(source);
  expect(await classOf(page, ".site-page-cover")).toBe(sourceClass);
  expect(transitionErrors).toEqual([]);
});

test("search icon -> article marker", async ({ page, context, baseURL }) => {
  const transitionErrors = watchTransitionErrors(page);
  await context.addCookies([{ name: "opuscule-theme", value: "dark", url: baseURL ?? "http://127.0.0.1:5174" }]);
  await page.goto("/search?q=%E9%9B%BE", { waitUntil: "domcontentloaded" });
  await settle(page, ".site-hit-icon");
  await page.locator(".site-hit-main").first().hover();
  const source = await nameOf(page, ".site-hit-icon");
  const sourceClass = await classOf(page, ".site-hit-icon");
  expect(source).toMatch(/^vt-icon-/);
  expect(sourceClass).toBe("icon");

  await page.locator(".site-hit-main").first().click();
  await page.waitForURL("**/wiki/**");
  await settle(page, ".site-page-marker");
  expect(await nameOf(page, ".site-page-marker")).toBe(source);
  expect(await classOf(page, ".site-page-marker")).toBe(sourceClass);
  expect(transitionErrors).toEqual([]);
});

test("profile world initial -> wiki hero mark", async ({ page, context, baseURL }) => {
  const transitionErrors = watchTransitionErrors(page);
  await context.addCookies([{ name: "opuscule-theme", value: "dark", url: baseURL ?? "http://127.0.0.1:5174" }]);
  await page.goto("/u/traveler", { waitUntil: "domcontentloaded" });
  await settle(page, ".profile-world-row");
  await page.locator(".profile-world-row").first().hover();
  const source = await nameOf(page, ".profile-world-initial");
  const sourceClass = await classOf(page, ".profile-world-initial");
  expect(source).toMatch(/^vt-icon-/);
  expect(sourceClass).toBe("icon");

  await page.locator(".profile-world-row").first().click();
  await page.waitForURL("**/wiki");
  await settle(page, ".site-hero-mark");
  expect(await nameOf(page, ".site-hero-mark")).toBe(source);
  expect(await classOf(page, ".site-hero-mark")).toBe(sourceClass);
  expect(transitionErrors).toEqual([]);
});

test("brand mark -> home brand mark", async ({ page, context, baseURL }) => {
  const transitionErrors = watchTransitionErrors(page);
  await context.addCookies([{ name: "opuscule-theme", value: "dark", url: baseURL ?? "http://127.0.0.1:5174" }]);
  await page.goto("/explore", { waitUntil: "domcontentloaded" });
  await settle(page, ".site-brand-mark");
  await page.locator(".site-brand-mark").hover();
  const source = await nameOf(page, ".site-brand-mark");
  expect(source).toBe("vt-icon-brand");

  await page.locator(".site-brand-mark").click();
  await page.waitForURL(`${baseURL ?? "http://127.0.0.1:5174"}/`);
  await settle(page, ".site-hero");
  expect(await nameOf(page, ".site-brand-mark")).toBe("vt-icon-brand");
  expect(await classOf(page, ".site-brand-mark")).toBe("icon");
  expect(transitionErrors).toEqual([]);
});


test("root and shared fades start together (no 40ms dip)", async ({ page, context, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "timing probe runs once");
  await context.addCookies([{ name: "opuscule-theme", value: "dark", url: baseURL ?? "http://127.0.0.1:5174" }]);
  await page.addInitScript(() => {
    window.__vtProbe = { reveal: false, animations: [], mid: null };
    addEventListener("pagereveal", (event) => {
      const transition = event.viewTransition;
      if (!transition) return;
      window.__vtProbe.reveal = true;
      requestAnimationFrame(() => {
        const animations = document.getAnimations({ subtree: true });
        window.__vtProbe.animations = animations.map((animation) => ({
          name: animation.animationName,
          pseudo: animation.effect?.pseudoElement ?? null,
          duration: animation.effect?.getTiming().duration ?? null,
          delay: animation.effect?.getTiming().delay ?? null,
        }));
        for (const animation of animations) { animation.pause(); animation.currentTime = 70; }
        const read = (pseudo: string) => getComputedStyle(document.documentElement, pseudo);
        window.__vtProbe.mid = {
          rootOld: read("::view-transition-old(root)").opacity,
          rootNew: read("::view-transition-new(root)").opacity,
          rootBlend: read("::view-transition-old(root)").mixBlendMode,
          coverOld: read("::view-transition-old(vt-cover-wuhai)").opacity,
          coverNew: read("::view-transition-new(vt-cover-wuhai)").opacity,
          coverBlend: read("::view-transition-new(vt-cover-wuhai)").mixBlendMode,
        };
      });
    });
  });
  await page.goto("/explore", { waitUntil: "domcontentloaded" });
  await settle(page, ".site-tile");
  await page.locator(".site-tile").first().hover();
  await page.locator(".site-tile").first().click();
  await page.waitForURL("**/wiki");
  await page.waitForTimeout(400);
  const probe = await page.evaluate(() => window.__vtProbe);
  expect(probe.reveal).toBe(true);
  const rootOld = probe.animations.find((item) => item.pseudo === "::view-transition-old(root)" && item.name.includes("fade-out"));
  const rootNew = probe.animations.find((item) => item.pseudo === "::view-transition-new(root)" && item.name.includes("fade-in"));
  const coverOld = probe.animations.find((item) => item.pseudo === "::view-transition-old(vt-cover-wuhai)" && item.name.includes("fade-out"));
  const coverNew = probe.animations.find((item) => item.pseudo === "::view-transition-new(vt-cover-wuhai)" && item.name.includes("fade-in"));
  expect(rootOld).toMatchObject({ duration: 140, delay: 0 });
  expect(rootNew).toMatchObject({ duration: 140, delay: 0 });
  expect(coverOld).toMatchObject({ duration: 160, delay: 0 });
  expect(coverNew).toMatchObject({ duration: 160, delay: 0 });
  expect(Number(probe.mid.rootOld)).toBeGreaterThan(0.1);
  expect(Number(probe.mid.rootNew)).toBeGreaterThan(0.1);
  expect(Number(probe.mid.coverOld)).toBeGreaterThan(0.1);
  expect(Number(probe.mid.coverNew)).toBeGreaterThan(0.1);
  expect(probe.mid.rootBlend).toBe("plus-lighter");
  expect(probe.mid.coverBlend).toBe("plus-lighter");
});
