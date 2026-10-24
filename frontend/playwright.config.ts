import { defineConfig } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(dirname(fileURLToPath(import.meta.url)), ".playwright-browsers");


const BASE_URL = "http://127.0.0.1:5174";

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  use: {
    baseURL: BASE_URL,
    screenshot: { fullPage: true, animations: "disabled", caret: "hide" },
    trace: "off",
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: { viewport: { width: 1440, height: 900 }, channel: "chrome" },
    },
    {
      name: "desktop",
      testMatch: /(public|vt-names)\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 }, channel: "chrome" },
    },
    {
      name: "mobile",
      testMatch: /(public|vt-names)\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 }, channel: "chrome" },
    },
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        viewport: { width: 1440, height: 900 },
        channel: "chrome",
        storageState: ".auth/state.json",
      },
    },
    {
      name: "webkit",
      testMatch: /smoke\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: {
        browserName: "webkit",
        viewport: { width: 1280, height: 800 },
        storageState: ".auth/state.json",
      },
    },
  ],
  webServer: [
    {
      command: "../backend/.venv/bin/python manage.py runserver 127.0.0.1:8000 --noreload",
      cwd: "../backend",
      url: "http://127.0.0.1:8000/api/health/",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "SSR_PORT=5174 node server.mjs",
      cwd: ".",
      url: `${BASE_URL}/`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
