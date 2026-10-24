import { createReadStream, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize, resolve } from "node:path";

import { renderExplore, renderHome, renderProfile, renderStatus, renderWiki } from "./dist-ssr/entry-server.js";

const PORT = Number(process.env.SSR_PORT ?? 5175);
const API = process.env.API_BASE ?? "http://127.0.0.1:8000/api";
const dist = resolve("dist");
const manifest = JSON.parse(readFileSync(join(dist, ".vite/manifest.json"), "utf8"));
const entry = manifest["index.html"];
const ssrClient = manifest["src/ssr/entry-client.tsx"];
if (!entry || !ssrClient) throw new Error("client manifest entries missing");

function cssFor(key, seen = new Set()) {
  if (seen.has(key)) return [];
  seen.add(key);
  const record = manifest[key];
  if (!record) return [];
  return [...(record.css ?? []), ...(record.imports ?? []).flatMap((item) => cssFor(item, seen))];
}

const cssFiles = [...new Set(cssFor("index.html"))];
const mime = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

async function fetchJson(path) {
  const response = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  return response.json();
}

function shell({ title, description, canonical, body, initial, ssr, theme = "dark" }) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}">
<head>
  <style>
    @view-transition { navigation: auto; }
    /* Paint the canvas before the stylesheet arrives: a full-page click must
       not flash white between the old document and the new one. */
    html { background: #18181b; color-scheme: dark; }
    html[data-theme="light"] { background: #ffffff; color-scheme: light; }
    body { margin: 0; background: inherit; }
  </style>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="${theme === "light" ? "#ffffff" : "#18181b"}">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${ssr ? "index,follow" : "noindex,follow"}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${initial?.card ? "article" : "website"}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta name="twitter:card" content="summary">
  ${cssFiles.map((file) => `<link rel="stylesheet" href="/${file}">`).join("\n  ")}
</head>
<body>
  <div id="root">${body}</div>
  ${initial ? `<script>window.__INITIAL__=${safeJson(initial)};</script>` : ""}
  <script type="module" src="/${ssrClient.file}"></script>
</body>
</html>`;
}

function readTheme(request) {
  const cookie = request.headers.cookie ?? "";
  const found = cookie.match(/(?:^|;\s*)opuscule-theme=(dark|light)/);
  return found ? found[1] : "dark";
}


function sendHtml(response, status, html) {
  const body = String(html);
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-cache",
  });
  response.end(body);
}

function sendStatus(response, { status, variant, title, description, canonical, theme }) {
  sendHtml(response, status, shell({ title, description, canonical, body: renderStatus(variant), theme, ssr: false }));
}

const SPA_ROUTE =
  /^\/(?:login|register|trash|search|worlds\/new|invite\/[^/]+|w\/[^/]+(?:\/(?:map|timeline))?)\/?$/;

function serveStatic(pathname, response) {
  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad path");
    return;
  }
  const file = normalize(join(dist, relative));
  if (!file.startsWith(dist)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Cache-Control": relative.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function proxy(request, response, pathname) {
  if (
    !pathname.startsWith("/api/") &&
    !["/robots.txt", "/sitemap.xml", "/feed.xml"].includes(pathname) &&
    !/^\/w\/[^/]+\/feed\.xml$/.test(pathname) &&
    !pathname.startsWith("/share/") &&
    !pathname.startsWith("/admin/") &&
    !pathname.startsWith("/static/")
  ) {
    return false;
  }
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: 8000,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: request.headers.host ?? "127.0.0.1:8000" },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => {
    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Django API unavailable");
  });
  request.pipe(upstream);
  return true;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  const theme = readTheme(request);
  if (url.pathname === "/healthz" || url.pathname === "/readyz") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ status: "ok", service: "opuscule-web" }));
    return;
  }
  if (proxy(request, response, url.pathname)) return;

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    serveStatic(url.pathname, response);
    return;
  }

  if (url.pathname === "/explore" || url.pathname === "/explore/") {
    try {
      const worlds = await fetchJson("/explore/");
      if (!worlds) {
        response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Explore API unavailable");
        return;
      }
      const initial = { kind: "explore", worlds };
      const body = renderExplore(initial);
      sendHtml(response, 200, shell({
          title: "公开世界 · Opuscule",
          description: "浏览已经公开的世界，进入它们的 Wiki。",
          canonical: `${url.origin}/explore`,
          body,
          initial,
          theme,
          ssr: true,
        }),);
      return;
    } catch (error) {
      console.error(error);
      await sendStatus(response, { status: 500, variant: "500", title: "500 · Opuscule", description: "页面渲染失败。", canonical: `${url.origin}${url.pathname}`, theme });
      return;
    }
  }

  const profileMatch = url.pathname.match(/^\/u\/([^/]+)\/?$/);
  if (profileMatch) {
    const username = decodeURIComponent(profileMatch[1]);
    try {
      const profile = await fetchJson(`/u/${encodeURIComponent(username)}/`);
      if (!profile) {
        await sendStatus(response, { status: 404, variant: "404", title: "个人主页不存在 · Opuscule", description: "这个个人主页不存在或未公开。", canonical: `${url.origin}${url.pathname}`, theme });
        return;
      }
      const initial = { kind: "profile", username, profile };
      const body = renderProfile(initial);
      sendHtml(response, 200, shell({
          title: `${profile.name} · Opuscule`,
          description: profile.bio?.slice(0, 180) || profile.headline || "Opuscule 个人主页。",
          canonical: `${url.origin}/u/${username}`,
          body,
          initial,
          theme,
          ssr: true,
        }),);
      return;
    } catch (error) {
      console.error(error);
      await sendStatus(response, { status: 500, variant: "500", title: "500 · Opuscule", description: "页面渲染失败。", canonical: `${url.origin}${url.pathname}`, theme });
      return;
    }
  }

  if (url.pathname === "/") {
    try {
      const world = await fetchJson("/worlds/wuhai/");
      if (!world) {
        response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Home API unavailable");
        return;
      }
      const initial = { kind: "home", world };
      const body = renderHome(initial);
      sendHtml(response, 200, shell({
          title: `${world.name}`,
          description: world.description || "一个公开的 Opuscule 世界。",
          canonical: `${url.origin}/`,
          body,
          initial,
          theme,
          ssr: true,
        }),);
      return;
    } catch (error) {
      console.error(error);
      await sendStatus(response, { status: 500, variant: "500", title: "500 · Opuscule", description: "页面渲染失败。", canonical: `${url.origin}${url.pathname}`, theme });
      return;
    }
  }

  const match = url.pathname.match(/^\/w\/([^/]+)\/wiki(?:\/([^/]+))?\/?$/);
  if (!match && /\.[a-z0-9]+$/i.test(url.pathname)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  if (!match && !SPA_ROUTE.test(url.pathname)) {
    await sendStatus(response, {
      status: 404,
      variant: "404",
      title: "页面不存在 · Opuscule",
      description: "这个地址没有对应的页面。",
      canonical: `${url.origin}${url.pathname}`,
      theme,
    });
    return;
  }

  if (!match) {
    const index = join(dist, "index.html");
    try {
      const html = readFileSync(index, "utf8")
        .replace('data-theme="dark"', `data-theme="${theme}"`)
        .replace('content="#18181b"', `content="${theme === "light" ? "#ffffff" : "#18181b"}"`);
      sendHtml(response, 200, html);
    } catch {
      response.writeHead(500);
      response.end("Missing dist/index.html");
    }
    return;
  }

  const worldSlug = decodeURIComponent(match[1]);
  const cardSlug = match[2] ? decodeURIComponent(match[2]) : undefined;
  try {
    const world = await fetchJson(`/worlds/${encodeURIComponent(worldSlug)}/`);
    if (!world || !world.is_public_read) {
      await sendStatus(response, { status: 404, variant: "missing-world", title: "世界不存在 · Opuscule", description: "这个公开 Wiki 不存在。", canonical: `${url.origin}${url.pathname}`, theme });
      return;
    }
    const card = cardSlug ? await fetchJson(`/worlds/${encodeURIComponent(worldSlug)}/cards/by-slug/${encodeURIComponent(cardSlug)}/`) : null;
    if (cardSlug && !card) {
      await sendStatus(response, { status: 404, variant: "missing-card", title: "卡片不存在 · Opuscule", description: "这张公开 Wiki 卡片不存在。", canonical: `${url.origin}${url.pathname}`, theme });
      return;
    }
    const initial = { kind: "wiki", worldSlug, cardSlug, world, card: card ?? undefined };
    const body = renderWiki(initial);
    const title = card ? `${card.title} · ${world.name}` : world.name;
    const description = (card?.body_text || world.description || "").slice(0, 180);
    const canonical = `${url.origin}/w/${worldSlug}/wiki${cardSlug ? `/${cardSlug}` : ""}`;
    sendHtml(response, 200, shell({ title, description, canonical, body, initial, theme, ssr: true }));
  } catch (error) {
    console.error(error);
    await sendStatus(response, { status: 500, variant: "500", title: "500 · Opuscule", description: "页面渲染失败。", canonical: `${url.origin}${url.pathname}`, theme });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Opuscule production SSR: http://127.0.0.1:${PORT}`);
});
