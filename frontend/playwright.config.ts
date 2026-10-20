import { defineConfig } from "@playwright/test";

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
    channel: "chrome",
    screenshot: { fullPage: true, animations: "disabled", caret: "hide" },
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
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
