import { expect, test as setup } from "@playwright/test";

const AUTH_FILE = ".auth/state.json";

setup("login as local demo traveler", async ({ request, baseURL }) => {
  await request.get("/api/auth/csrf/");
  const state = await request.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === "csrftoken")?.value;
  expect(csrf, "csrf cookie").toBeTruthy();

  const response = await request.post("/api/auth/login/", {
    data: { username: "traveler", password: "opuscule-demo" },
    headers: {
      "X-CSRFToken": csrf ?? "",
      Referer: baseURL ?? "http://127.0.0.1:5174/",
    },
  });
  expect(response.ok(), `login status ${response.status()}`).toBeTruthy();

  const session = await request.get("/api/auth/session/");
  expect(session.ok()).toBeTruthy();
  expect((await session.json()).authenticated).toBe(true);

  await request.storageState({ path: AUTH_FILE });
});
