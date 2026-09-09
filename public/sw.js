/**
 * Minimal offline cache. The whole app -- including the 2,000-dish catalog --
 * is static, so once it has loaded on wifi it keeps working in a dining hall
 * with no signal. Gemini calls are never cached; they need the network.
 *
 * PRECACHE and VERSION are filled in at build time by the sw-precache plugin
 * in vite.config.ts, so a fresh deploy invalidates the old cache.
 */
const VERSION = "__SW_VERSION__";
const PRECACHE = __SW_PRECACHE__;
const CACHE = `uga-plate-${VERSION}`;

/**
 * Static hosts commonly answer with `Vary: Origin`. Precache entries are
 * fetched without an Origin header while module scripts send one, so a strict
 * Vary check would miss every asset we just cached.
 */
const MATCH = { ignoreVary: true };

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      // One bad URL must not fail the whole install.
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {})),
        ),
      ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network so deploys land, fall back to the cached shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(request, MATCH)) ??
            (await cache.match("./index.html", MATCH)) ??
            (await cache.match("./", MATCH)) ??
            Response.error()
          );
        }),
    );
    return;
  }

  // Hashed assets never change under the same name, so cache-first is safe.
  event.respondWith(
    caches.match(request, MATCH).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
