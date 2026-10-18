/* 离线与缓存：Service Worker（浏览器的后台网络代理）
 * ---------------------------------------------------------------------------
 * Service Worker 是浏览器里一段独立于页面、后台常驻的脚本，充当"网络中间人"：
 * 页面发出的每个请求都先经过它，它可以放行，也可以直接从本地缓存回一份。
 * 这份脚本只接管三类请求，其余一律原样放行。
 *
 *   1. **带 ?v= 版本号的静态资源**：cache-first（先查缓存）。URL 里带着版本号，
 *      内容一旦发布就不再变，所以缓存最省事，也最安全。
 *   2. **HTML 导航请求**：network-first（先联网络）。页面是服务端渲染的，带着
 *      CSRF、世界状态、发布状态，旧 HTML 配上新脚本必然错位；只有真断网了，
 *      才回退到那张离线兜底页。
 *   3. **`/api/*`：完全不接管**。这些是 `Cache-Control: no-store` 的实时数据，
 *      缓存它们只会让你看到的东西变得不可信。
 *
 * 升级：缓存名里带版本号，新版本 activate 时把旧版本整体删掉。
 */

const VERSION = 'v1';
const STATIC_CACHE = `opus-static-${VERSION}`;
const SHELL_CACHE = `opus-shell-${VERSION}`;
const OFFLINE_URL = '/static/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    } catch (error) {
      /* 兜底页拿不到也不该卡住安装 */
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

/** 只缓存"版本化过的静态资源"：同源 + /static/ + 带 ?v=。 */
function isVersionedAsset(url) {
  return url.origin === self.location.origin
    && url.pathname.startsWith('/static/')
    && url.searchParams.has('v');
}

/** 世界级接口挂在 /w/<slug>/api/world 下，和 /api/ 一样是实时数据。 */
function isApiPath(pathname) {
  return pathname.startsWith('/api/') || /^\/w\/[^/]+\/api\//.test(pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // 别人的东西不碰
  if (isApiPath(url.pathname)) return;                  // 实时数据不缓存

  // 1) 版本化静态资源：cache-first（后台顺手刷新一次，几乎不会变）
  if (isVersionedAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  // 2) HTML 导航：network-first，断网才用兜底页
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const cache = await caches.open(SHELL_CACHE);
        const fallback = await cache.match(OFFLINE_URL);
        if (fallback) return fallback;
        return new Response('离线了，而且兜底页还没缓存上。', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
  }
});
