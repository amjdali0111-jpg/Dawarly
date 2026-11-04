/* Dawarly service worker.
 * Safety rules:
 *  - Only same-origin GET requests for public, immutable static assets are cached
 *    (/_next/static, /icons, /images, the manifest and the offline page).
 *  - Pages (HTML), API routes, auth callbacks, Supabase requests, signed storage
 *    URLs and anything with credentials are NEVER cached: private reports,
 *    messages and tokens stay off disk.
 *  - Navigations are network-only; when offline a static offline page is shown.
 */
const CACHE = "dawarly-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

function isCacheable(url, request) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.search && !url.pathname.startsWith("/_next/static/")) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === OFFLINE_URL
  );
}
self.__dawarlyIsCacheable = isCacheable; // exposed for unit tests

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (!isCacheable(url, request)) return; // default network behaviour, no caching

  event.respondWith(
    caches.match(request).then((hit) =>
      hit ||
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
