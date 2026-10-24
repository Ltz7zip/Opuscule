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

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-shell").waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await expect(page).toHaveScreenshot(`auth-login-light-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });

  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-shell").waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await expect(page).toHaveScreenshot(`auth-register-light-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });

  await page.goto(`/w/${world.slug}?card=${overviewId}`, { waitUntil: "domcontentloaded" });
  await page.locator(".tree-row").first().waitFor({ timeout: 20_000 });
  await expect(page).toHaveScreenshot(`workspace-light-${testInfo.project.name}.png`, { fullPage: false, maxDiffPixelRatio: 0 });

  await page.goto(`/w/${world.slug}/map`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await expect(page).toHaveScreenshot(`map-light-${testInfo.project.name}.png`, { fullPage: false, maxDiffPixelRatio: 0 });

  await page.goto("/w/wuhai/wiki", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`ssr-wiki-light-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });
});

test("auth dark: login and register", async ({ page, context }, testInfo) => {
  await context.addCookies([{ name: "opuscule-theme", value: "dark", url: "http://127.0.0.1:5174" }]);
  await page.addInitScript(() => localStorage.setItem("opuscule-theme", "dark"));
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-shell").waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await expect(page).toHaveScreenshot(`auth-login-dark-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-shell").waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await expect(page).toHaveScreenshot(`auth-register-dark-${testInfo.project.name}.png`, { maxDiffPixelRatio: 0 });
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
