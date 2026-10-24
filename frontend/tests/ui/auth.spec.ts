import { expect, test, request as apiRequest, type APIRequestContext, type Page } from "@playwright/test";

const AUTH_FILE = ".auth/state.json";
const LIGHT_COOKIE = { name: "opuscule-theme", value: "light", url: "http://127.0.0.1:5174" };

interface Card { id: number; slug: string; }
interface World { id: number; slug: string; cards: Card[]; }

let api: APIRequestContext;
let world: World;
let overviewId: number;
let pin: Card;
let lightbox: Card;
let csrf = "";

async function mutationHeaders(baseURL: string) {
  return { "X-CSRFToken": csrf, Referer: `${baseURL}/` };
}

async function createCard(baseURL: string, title: string, body: unknown): Promise<Card> {
  const response = await api.post(`/api/worlds/${world.slug}/cards/`, {
    data: { title, type_key: "note", kind: "content", body_json: body, is_public: true },
    headers: await mutationHeaders(baseURL),
  });
  expect(response.ok(), `create card ${title}: ${response.status()}`).toBeTruthy();
  return response.json();
}

async function readName(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((node) => ({
    name: getComputedStyle(node).viewTransitionName,
    cls: getComputedStyle(node).viewTransitionClass,
  }));
}

test.beforeAll(async ({ baseURL }) => {
  const base = baseURL ?? "http://127.0.0.1:5174";
  api = await apiRequest.newContext({ baseURL: base, storageState: AUTH_FILE });
  await api.get("/api/auth/csrf/");
  const state = await api.storageState();
  csrf = state.cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  expect(csrf).toBeTruthy();

  const created = await api.post("/api/worlds/", {
    data: { name: "R2 Light Matrix", is_public_read: true },
    headers: await mutationHeaders(base),
  });
  expect(created.ok(), `create world: ${created.status()}`).toBeTruthy();
  world = await created.json();
  overviewId = world.cards[0].id;

  pin = await createCard(base, "R2 Pin", {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "pin target" }] }],
  });
  lightbox = await createCard(base, "R2 Lightbox", {
    type: "doc",
    content: [{
      type: "imageBlock",
      attrs: { src: "/r2-lightbox.png", alt: "R2 Lightbox", caption: "R2 Lightbox" },
    }],
  });

  const marker = await api.post(`/api/worlds/${world.slug}/map/markers/`, {
    data: { label: "R2 Pin Target", kind: "place", x: 0.5, y: 0.5, card: pin.id },
    headers: await mutationHeaders(base),
  });
  expect(marker.ok(), `create marker: ${marker.status()}`).toBeTruthy();

  const entry = await api.post(`/api/worlds/${world.slug}/timeline/entries/`, {
    data: { year: 42, title: "R2 Timeline Target", card: pin.id },
    headers: await mutationHeaders(base),
  });
  expect(entry.ok(), `create timeline entry: ${entry.status()}`).toBeTruthy();
});

test.afterAll(async () => {
  if (!world) return;
  const response = await api.delete(`/api/worlds/${world.slug}/`, { headers: await mutationHeaders("http://127.0.0.1:5174") });
  console.log(`temporary world ${world.slug} delete -> ${response.status()}`);
  await api.dispose();
});

test("map pin -> article type marker", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`/w/${world.slug}/map`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await page.locator(".map-pin", { hasText: "R2 Pin Target" }).click();
  await page.waitForTimeout(200);
  const source = await page.locator(".map-pin-icon").filter({ has: page.locator("svg") }).evaluateAll((nodes) => nodes
    .map((node) => ({ name: getComputedStyle(node).viewTransitionName, cls: getComputedStyle(node).viewTransitionClass }))
    .find((item) => item.name !== "none"));
  expect(source?.name).toBe(`vt-icon-${pin.slug}`);
  expect(source?.cls).toBe("icon");

  await page.locator(`a.studio-primary[href="/w/${world.slug}/wiki/${pin.slug}"]`).click();
  await page.waitForURL(`**/wiki/${pin.slug}`);
  await page.waitForTimeout(500);
  const target = await readName(page, ".site-page-marker");
  expect(target).toEqual(source);
  expect(errors).toEqual([]);
});

test("timeline dot -> article type marker", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`/w/${world.slug}/timeline`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const card = page.locator(".timeline-event-card", { hasText: "R2 Timeline Target" });
  await card.click();
  await page.waitForTimeout(200);
  const source = await page.locator(".timeline-event.selected .timeline-event-dot").evaluate((node) => ({
    name: getComputedStyle(node).viewTransitionName,
    cls: getComputedStyle(node).viewTransitionClass,
  }));
  expect(source).toEqual({ name: `vt-icon-${pin.slug}`, cls: "icon" });

  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "打开关联卡片" }).click();
  await page.waitForURL(`**/wiki/${pin.slug}`);
  await page.waitForTimeout(500);
  expect(await readName(page, ".site-page-marker")).toEqual(source);
  expect(errors).toEqual([]);
});

test("workspace tree icon -> editor page icon", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`/w/${world.slug}?card=${overviewId}`, { waitUntil: "domcontentloaded" });
  await page.locator(".tree-row").first().waitFor({ timeout: 20_000 });
  await page.evaluate(() => {
    const target = window as typeof window & { __vtCalls?: number };
    target.__vtCalls = 0;
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    document.startViewTransition = (callback: ViewTransitionUpdateCallback) => {
      target.__vtCalls = (target.__vtCalls ?? 0) + 1;
      return original(callback);
    };
  });
  const row = page.locator(".tree-row", { hasText: "R2 Pin" }).first();
  await row.hover();
  const source = await row.locator(".tree-icon").evaluate((node) => ({
    name: getComputedStyle(node).viewTransitionName,
    cls: getComputedStyle(node).viewTransitionClass,
  }));
  expect(source.name).toBe(`vt-icon-${pin.slug}`);
  expect(source.cls).toBe("icon");

  await row.click();
  await page.waitForURL(`**card=${pin.id}`);
  await expect.poll(async () => readName(page, ".page-icon"), { timeout: 1500 }).toEqual(source);
  expect(await page.evaluate(() => (window as typeof window & { __vtCalls?: number }).__vtCalls ?? 0)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
});

test("lightbox thumbnail -> large image", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`/w/${world.slug}/wiki/${lightbox.slug}`, { waitUntil: "domcontentloaded" });
  const trigger = page.locator(".rich-image-open").first();
  await trigger.waitFor({ timeout: 15_000 });
  await trigger.hover();
  const source = await readName(page, ".rich-image-leaf");
  expect(source.name).toMatch(/^vt-cover-/);
  expect(source.cls).toBe("cover");

  await trigger.click();
  await expect.poll(async () => page.locator(".rich-lightbox img").count(), { timeout: 1500 }).toBe(1);
  const target = await readName(page, ".rich-lightbox img");
  expect(target).toEqual(source);
  await expect(page.locator(".rich-lightbox")).toHaveAttribute("role", "dialog");
  await page.keyboard.press("Escape");
  await expect(page.locator(".rich-lightbox")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test("login brand -> home brand", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-brand-glyph").waitFor();
  const source = await readName(page, ".auth-brand-glyph");
  expect(source).toEqual({ name: "vt-icon-brand", cls: "icon" });
  await page.locator(".auth-top-brand").click();
  await page.waitForURL("/");
  await page.waitForTimeout(400);
  expect(await readName(page, ".site-brand-mark")).toEqual(source);
});

test("auth form: verifying -> denied -> granted", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-shell").waitFor({ timeout: 15_000 });
  await page.locator("#id_username").fill("traveler");
  await page.locator("#id_password").fill("wrong-password");
  await page.locator("#authSubmit").click();
  await expect(page.locator(".auth-shell")).toHaveAttribute("data-state", "denied", { timeout: 10_000 });
  await expect(page.locator(".auth-warn")).toBeVisible();
  await expect(page.locator(".auth-shell")).toHaveAttribute("data-has-error", "1");

  await page.evaluate(() => {
    const shell = document.querySelector(".auth-shell");
    if (!shell) return;
    const states: string[] = [shell.getAttribute("data-state") ?? ""];
    sessionStorage.setItem("__authStates", JSON.stringify(states));
    new MutationObserver(() => {
      states.push(shell.getAttribute("data-state") ?? "");
      sessionStorage.setItem("__authStates", JSON.stringify(states));
    }).observe(shell, { attributes: true, attributeFilter: ["data-state"] });
  });
  await page.locator("#id_password").fill("opuscule-demo");
  await page.locator("#authSubmit").click();
  await expect(page.locator(".auth-shell")).toHaveAttribute("data-state", "verifying");
  await page.waitForURL("**/w/**", { timeout: 8_000 });
  const states = await page.evaluate(() => JSON.parse(sessionStorage.getItem("__authStates") ?? "[]") as string[]);
  expect(states).toContain("unfold");
});

test("light matrix: login, register, workspace, map, SSR wiki", async ({ page, context }, testInfo) => {
  await context.addCookies([LIGHT_COOKIE]);
  await page.addInitScript(() => localStorage.setItem("opuscule-theme", "light"));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-shell").waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`auth-login-light-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });

  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-shell").waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`auth-register-light-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });

  await page.goto(`/w/${world.slug}?card=${overviewId}`, { waitUntil: "domcontentloaded" });
  await page.locator(".tree-row").first().waitFor({ timeout: 20_000 });
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`workspace-light-${testInfo.project.name}.png`, { fullPage: false, maxDiffPixelRatio: 0 });

  await page.goto(`/w/${world.slug}/map`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`map-light-${testInfo.project.name}.png`, { fullPage: false, maxDiffPixelRatio: 0 });

  await page.goto("/w/wuhai/wiki", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`ssr-wiki-light-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });
});

test("auth dark: login and register", async ({ page, context }, testInfo) => {
  await context.addCookies([{ name: "opuscule-theme", value: "dark", url: "http://127.0.0.1:5174" }]);
  await page.addInitScript(() => localStorage.setItem("opuscule-theme", "dark"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-shell").waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`auth-login-dark-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-shell").waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`auth-register-dark-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });
});

test("custom controls: timeline select, single-border search, checkbox", async ({ page }) => {
  await page.goto("/w/wuhai/timeline", { waitUntil: "domcontentloaded" });
  await page.locator(".timeline-canvas-shell").waitFor({ timeout: 20_000 });
  await expect(page.locator(".timeline-page .sidebar")).toHaveScreenshot("timeline-sidebar-dark-auth.png");
  const trigger = page.locator(".select-menu-trigger").first();
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const listbox = page.locator(".select-menu-pop");
  await expect(listbox).toBeVisible();
  await expect(listbox).toHaveAttribute("role", "listbox");
  await expect(listbox.locator("[role=option]")).toHaveCount(2);
  await expect(listbox).toHaveCSS("animation-name", "select-in");
  const second = listbox.locator("[role=option]").nth(1);
  await second.click();
  await expect(trigger).toContainText("航海志");

  await page.locator(".timeline-canvas-viewport").click({ button: "right", position: { x: 520, y: 410 } });
  const timelineMenu = page.locator(".ctx-menu");
  await expect(timelineMenu).toBeVisible();
  await expect(timelineMenu).toContainText("新建时间点");
  await expect(timelineMenu).toContainText("复制时间线链接");
  await page.keyboard.press("Escape");

  await page.goto(`/w/${world.slug}?card=${overviewId}`, { waitUntil: "domcontentloaded" });
  await page.locator(".tree-row").first().waitFor({ timeout: 20_000 });
  await expect(page.locator(".sidebar").first()).toHaveScreenshot("workspace-sidebar-dark-auth.png");
  const search = page.locator(".search").first();
  const input = search.locator("input");
  await expect(search).toHaveCSS("height", "44px");
  await expect(input).toHaveCSS("border-top-width", "0px");
  await input.focus();
  const focused = await search.evaluate((node) => getComputedStyle(node).boxShadow);
  expect(focused).not.toBe("none");

  await page.goto("/explore", { waitUntil: "domcontentloaded" });
  const tile = page.locator(".site-tile").first();
  await tile.waitFor();
  await expect(tile).toHaveCSS("transition-property", /transform/);
  await tile.hover();
  await expect.poll(async () => tile.evaluate((node) => getComputedStyle(node).transform), { timeout: 1000 }).not.toBe("none");

  await page.goto("/worlds/new", { waitUntil: "domcontentloaded" });
  const checkbox = page.locator('input[type="checkbox"]').first();
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toHaveCSS("appearance", "none");
  const size = await checkbox.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { width: Math.round(box.width), height: Math.round(box.height) };
  });
  expect(size).toEqual({ width: 16, height: 16 });

  await page.goto("/w/wuhai/map", { waitUntil: "domcontentloaded" });
  await page.locator(".map-canvas").waitFor({ timeout: 20_000 });
  await page.locator(".map-canvas").click({ button: "right", position: { x: 320, y: 220 } });
  const contextMenu = page.locator(".ctx-menu");
  await expect(contextMenu).toBeVisible();
  await expect(contextMenu).toContainText("复制地图链接");
  await expect(contextMenu).toContainText("下载地图背景");
  await page.keyboard.press("Escape");
  await expect(contextMenu).toBeHidden();

  const mapBox = await page.locator(".map-canvas").boundingBox();
  if (mapBox) {
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  }
  await expect(page.locator(".map-lens")).toHaveClass(/is-on/);
  await expect(page.locator(".map-lens-meta")).toContainText("1.9×");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.mouse.move(360, 280);
  await page.mouse.move(720, 420, { steps: 12 });
  await expect(page.locator(".cursor-trail")).toHaveCount(1);
  const trailPixels = await page.locator(".cursor-trail").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) count += 1;
    return count;
  });
  expect(trailPixels).toBeGreaterThan(0);
});

test.describe("retina map lens", () => {
  test.use({ deviceScaleFactor: 2 });

  test("lens fills all four quadrants at DPR 2", async ({ page }) => {
    await page.goto("/w/wuhai/map", { waitUntil: "domcontentloaded" });
    await page.locator(".map-canvas").waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    const box = await page.locator(".map-canvas").boundingBox();
    if (!box) throw new Error("map canvas has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator(".map-lens")).toHaveClass(/is-on/);
    const quadrants = await page.locator(".map-lens canvas").evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const sample = (x: number, y: number) => {
        const data = ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
        return data[3];
      };
      return { width: canvas.width, height: canvas.height, q: [sample(0.25, 0.25), sample(0.75, 0.25), sample(0.25, 0.75), sample(0.75, 0.75)] };
    });
    expect(quadrants?.width).toBe(380);
    expect(quadrants?.height).toBe(380);
    expect(quadrants?.q.every((alpha) => alpha > 0)).toBe(true);
  });
});

test("motion opt-in overrides reduced motion for this site", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?motion=force", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/motion-force/);
  const hero = page.locator(".site-hero-main > *").first();
  await expect(hero).toHaveCSS("animation-name", "enter-rise");
  await expect(hero).toHaveCSS("animation-duration", "0.7s");
  await expect(page.locator(".pointer-glow")).toHaveCount(1);
  await expect(page.locator(".cursor-trail")).toHaveCount(1);
});

test("320px touch targets", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await context.addCookies([LIGHT_COOKIE]);
  const routes = ["/", "/explore", "/login", `/w/${world.slug}?card=${overviewId}`, `/w/${world.slug}/map`, `/w/${world.slug}/timeline`];
  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(route.includes("?card") || route.includes("/map") || route.includes("/timeline") ? 1800 : 300);
    const small = await page.evaluate(() => {
      return [...document.querySelectorAll<HTMLElement>("a,button,input,select,[role='button']")]
        .filter((node) => !node.closest(".site-article-body, .rich-text"))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        })
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label: (node.getAttribute("aria-label") || node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((item) => item.width < 44 || item.height < 44);
    });
    expect(small, `320px touch targets on ${route}`).toEqual([]);
  }
});
