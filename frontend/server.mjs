import { readFileSync } from "node:fs";
import http from "node:http";
import { createServer as createViteServer } from "vite";

const PORT = Number(process.env.SSR_PORT ?? 5174);
const API = process.env.API_BASE ?? "http://127.0.0.1:8000/api";
const vite = await createViteServer({ server: { middlewareMode: true }, appType: "custom" });

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

async function fetchJson(path, { cookie } = {}) {
  const headers = { Accept: "application/json" };
  // Forward the member session so per-world reads can see private worlds.
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${API}${path}`, { headers });
  if (!response.ok) return null;
  return response.json();
}

function readTheme(request) {
  const cookie = request.headers.cookie ?? "";
  const found = cookie.match(/(?:^|;\s*)opuscule-theme=(dark|light)/);
  return found ? found[1] : "dark";
}

function htmlShell({ title, description, canonical, body, initial, ssr, theme = "dark" }) {
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
  <link rel="stylesheet" href="/src/styles/app.css?direct">
  <link rel="stylesheet" href="/src/styles/auth.css?direct">
  <link rel="stylesheet" href="/src/styles/legacy-workspace.css?direct">
  <link rel="stylesheet" href="/src/styles/controls.css?direct">
</head>
<body>
  <div id="root">${body}</div>
  ${initial ? `<script>window.__INITIAL__=${safeJson(initial)};</script>` : ""}
  <script type="module" src="/src/ssr/entry-client.tsx"></script>
</body>
</html>`;
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

async function sendStatus(response, { status, variant, title, description, canonical, pathname, theme }) {
  try {
    const { renderStatus } = await vite.ssrLoadModule("/src/ssr/entry-server.tsx");
    sendHtml(
      response,
      status,
      await vite.transformIndexHtml(
        pathname,
        htmlShell({
          title,
          description,
          canonical,
          body: renderStatus(variant),
          theme,
          ssr: false,
        }),
      ),
    );
  } catch (error) {
    vite.ssrFixStacktrace(error);
    console.error(error);
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Status page failed (${status})`);
  }
}

const BACKEND_ORIGIN = new URL(API).origin;

/** Dev-only: let the SSR preview server serve SPA pages whose client code
 *  calls Django through relative URLs. */
function proxyToBackend(request, response) {
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
    if (response.headersSent) return;
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ detail: "Django API unavailable" }));
  });
  request.pipe(upstream);
}

const SPA_ROUTE =
  /^\/(?:login|register|trash|search|worlds\/new|invite\/[^/]+|w\/[^/]+(?:\/(?:map|timeline))?)\/?$/;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  const theme = readTheme(request);
  if (/^\/(?:api|media|static|share)\//.test(url.pathname)) {
    proxyToBackend(request, response);
    return;
  }

  if (url.pathname === "/healthz" || url.pathname === "/readyz") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ status: "ok", service: "opuscule-web" }));
    return;
  }
  const match = url.pathname.match(/^\/w\/([^/]+)\/wiki(?:\/([^/]+))?\/?$/);
  const isEditor = Boolean(match && match[2] === "edit");

  if (url.pathname === "/explore" || url.pathname === "/explore/") {
    try {
      const worlds = await fetchJson("/explore/");
      if (!worlds) {
        response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Explore API unavailable");
        return;
      }
      const initial = { kind: "explore", worlds };
      const { renderExplore } = await vite.ssrLoadModule("/src/ssr/entry-server.tsx");
      const body = renderExplore(initial);
      const html = await vite.transformIndexHtml(
        url.pathname,
        htmlShell({
          title: "公开世界 · Opuscule",
          description: "浏览已经公开的世界，进入它们的 Wiki。",
          canonical: `${url.origin}/explore`,
          body,
          initial,
          theme,
          ssr: true,
        }),
      );
      sendHtml(response, 200, html);
      return;
    } catch (error) {
      vite.ssrFixStacktrace(error);
      console.error(error);
      await sendStatus(response, {
        status: 500,
        variant: "500",
        title: "500 · Opuscule",
        description: "探索页渲染失败。",
        canonical: `${url.origin}${url.pathname}`,
        pathname: url.pathname,
        theme,
      });
      return;
    }
  }

  const profileMatch = url.pathname.match(/^\/u\/([^/]+)\/?$/);
  if (profileMatch) {
    const username = decodeURIComponent(profileMatch[1]);
    try {
      const profile = await fetchJson(`/u/${encodeURIComponent(username)}/`);
      if (!profile) {
        await sendStatus(response, {
          status: 404,
          variant: "404",
          title: "个人主页不存在 · Opuscule",
          description: "这个个人主页不存在或未公开。",
          canonical: `${url.origin}${url.pathname}`,
          pathname: url.pathname,
          theme,
        });
        return;
      }
      const initial = { kind: "profile", username, profile };
      const { renderProfile } = await vite.ssrLoadModule("/src/ssr/entry-server.tsx");
      const body = renderProfile(initial);
      sendHtml(response, 200, await vite.transformIndexHtml(
          url.pathname,
          htmlShell({
            title: `${profile.name} · Opuscule`,
            description: profile.bio?.slice(0, 180) || profile.headline || "Opuscule 个人主页。",
            canonical: `${url.origin}/u/${username}`,
            body,
            initial,
            theme,
            ssr: true,
          }),
        ),);
      return;
    } catch (error) {
      vite.ssrFixStacktrace(error);
      console.error(error);
      await sendStatus(response, {
        status: 500,
        variant: "500",
        title: "500 · Opuscule",
        description: "个人主页渲染失败。",
        canonical: `${url.origin}${url.pathname}`,
        pathname: url.pathname,
        theme,
      });
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
      const { renderHome } = await vite.ssrLoadModule("/src/ssr/entry-server.tsx");
      const body = renderHome(initial);
      sendHtml(response, 200, await vite.transformIndexHtml(
          url.pathname,
          htmlShell({
            title: `${world.name}`,
            description: world.description || "一个公开的 Opuscule 世界。",
            canonical: `${url.origin}/`,
            body,
            initial,
            theme,
            ssr: true,
          }),
        ),);
      return;
    } catch (error) {
      vite.ssrFixStacktrace(error);
      console.error(error);
      await sendStatus(response, {
        status: 500,
        variant: "500",
        title: "500 · Opuscule",
        description: "首页渲染失败。",
        canonical: `${url.origin}${url.pathname}`,
        pathname: url.pathname,
        theme,
      });
      return;
    }
  }

  const looksLikeAsset =
    /^\/(?:@|src\/|node_modules\/|assets\/)/.test(url.pathname) ||
    /\.[a-z0-9]+$/i.test(url.pathname);
  if (!isEditor && !match && !SPA_ROUTE.test(url.pathname) && !looksLikeAsset) {
    await sendStatus(response, {
      status: 404,
      variant: "404",
      title: "页面不存在 · Opuscule",
      description: "这个地址没有对应的页面。",
      canonical: `${url.origin}${url.pathname}`,
      pathname: url.pathname,
      theme,
    });
    return;
  }

  if (!match || isEditor) {
    vite.middlewares(request, response, async (error) => {
      if (error) {
        vite.ssrFixStacktrace(error);
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Vite middleware error");
        return;
      }
      try {
        const template = readFileSync("index.html", "utf8");
        let html = await vite.transformIndexHtml(url.pathname, template);
        html = html
          .replace('data-theme="dark"', `data-theme="${theme}"`)
          .replace('content="#18181b"', `content="${theme === "light" ? "#ffffff" : "#18181b"}"`);
        sendHtml(response, 200, html);
      } catch (cause) {
        vite.ssrFixStacktrace(cause);
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("SSR shell error");
      }
    });
    return;
  }

  const worldSlug = decodeURIComponent(match[1]);
  const sub = match[2] ? decodeURIComponent(match[2]) : undefined;
  const isCards = sub === "cards";
  const cardSlug = sub && sub !== "cards" ? sub : undefined;
  try {
    const cookie = request.headers.cookie;
    const world = await fetchJson(`/worlds/${encodeURIComponent(worldSlug)}/`, { cookie });
    if (!world) {
      const session = await fetchJson("/auth/session/", { cookie });
      if (session?.authenticated) {
        // Members may be opening a private or not-yet-created world; the SPA
        // resolves it with their session, so do not 404 at the edge.
        const html = await vite.transformIndexHtml(
          url.pathname,
          htmlShell({
            title: "私有 Wiki",
            description: "这个世界仅对成员开放。",
            canonical: `${url.origin}${url.pathname}`,
            body: "",
            theme,
            ssr: false,
          }),
        );
        sendHtml(response, 200, html);
        return;
      }
      await sendStatus(response, {
        status: 404,
        variant: "missing-world",
        title: "世界不存在 · Opuscule",
        description: "这个公开 Wiki 不存在。",
        canonical: `${url.origin}${url.pathname}`,
        pathname: url.pathname,
        theme,
      });
      return;
    }
    if (!world.is_public_read) {
      // Private worlds cannot be server-rendered without the member session.
      // Ship the client shell; App fetches the member-visible data in-browser.
      const html = await vite.transformIndexHtml(
        url.pathname,
        htmlShell({
          title: `${world.name} · 私有 Wiki`,
          description: "这个世界仅对成员开放。",
          canonical: `${url.origin}${url.pathname}`,
          body: "",
          theme,
          ssr: false,
        }),
      );
      sendHtml(response, 200, html);
      return;
    }

    if (isCards) {
      const concept = await fetchJson(`/worlds/${encodeURIComponent(worldSlug)}/concept/`);
      const initial = { kind: "wiki", worldSlug, mode: "cards", world, concept: concept ?? undefined };
      const { renderWiki } = await vite.ssrLoadModule("/src/ssr/entry-server.tsx");
      const body = renderWiki(initial);
      const html = await vite.transformIndexHtml(
        url.pathname,
        htmlShell({
          title: `设定集 · ${world.name}`,
          description: (world.description || "按分区浏览这个世界里的全部设定。").slice(0, 180),
          canonical: `${url.origin}/w/${worldSlug}/wiki/cards`,
          body,
          initial,
          theme,
          ssr: true,
        }),
      );
      sendHtml(response, 200, html);
      return;
    }

    if (!cardSlug) {
      const concept = await fetchJson(`/worlds/${encodeURIComponent(worldSlug)}/concept/`);
      if (concept) {
        const initial = { kind: "concept", worldSlug, world, concept };
        const { renderWorldConcept } = await vite.ssrLoadModule("/src/ssr/entry-server.tsx");
        const body = renderWorldConcept(initial);
        const html = await vite.transformIndexHtml(
          url.pathname,
          htmlShell({
            title: `${world.name} · 世界概念`,
            description: (concept.body_text || world.description || "").slice(0, 180),
            canonical: `${url.origin}/w/${worldSlug}/wiki`,
            body,
            initial,
            theme,
            ssr: true,
          }),
        );
        sendHtml(response, 200, html);
        return;
      }
      const initial = { kind: "wiki", worldSlug, mode: "read", world };
      const { renderWiki } = await vite.ssrLoadModule("/src/ssr/entry-server.tsx");
      const body = renderWiki(initial);
      const html = await vite.transformIndexHtml(
        url.pathname,
        htmlShell({
          title: world.name,
          description: (world.description || "").slice(0, 180),
          canonical: `${url.origin}/w/${worldSlug}/wiki`,
          body,
          initial,
          theme,
          ssr: true,
        }),
      );
      sendHtml(response, 200, html);
      return;
    }

    const card = await fetchJson(`/worlds/${encodeURIComponent(worldSlug)}/cards/by-slug/${encodeURIComponent(cardSlug)}/`);
    if (!card) {
      await sendStatus(response, {
        status: 404,
        variant: "missing-card",
        title: "卡片不存在 · Opuscule",
        description: "这张公开 Wiki 卡片不存在。",
        canonical: `${url.origin}${url.pathname}`,
        pathname: url.pathname,
        theme,
      });
      return;
    }
    const concept = await fetchJson(`/worlds/${encodeURIComponent(worldSlug)}/concept/`);
    const initial = { kind: "wiki", worldSlug, mode: "read", world, card, concept: concept ?? undefined };
    const { renderWiki } = await vite.ssrLoadModule("/src/ssr/entry-server.tsx");
    const body = renderWiki(initial);
    const html = await vite.transformIndexHtml(
      url.pathname,
      htmlShell({
        title: `${card.title} · ${world.name}`,
        description: (card.body_text || world.description || "").slice(0, 180),
        canonical: `${url.origin}/w/${worldSlug}/wiki/${cardSlug}`,
        body,
        initial,
        theme,
        ssr: true,
      }),
    );
    sendHtml(response, 200, html);
  } catch (error) {
    vite.ssrFixStacktrace(error);
    console.error(error);
    await sendStatus(response, {
      status: 500,
      variant: "500",
      title: "500 · Opuscule",
      description: "页面渲染失败。",
      canonical: `${url.origin}${url.pathname}`,
      pathname: url.pathname,
      theme,
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Opuscule SSR dev server: http://127.0.0.1:${PORT}`);
});
