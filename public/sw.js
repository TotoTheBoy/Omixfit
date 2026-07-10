// Omixfit service worker — offline app shell (plan.md §5.2).
// Cache-first for the built shell, network-first for navigations so updates land.
// Paths are relative to the SW location so this works at any base (root or a
// GitHub Pages subpath like /Omixfit/).
const CACHE = "omix-shell-v4";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/favicon.svg"];
const SHELL_FALLBACK = new URL("index.html", self.registration.scope).href;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  // Navigations: network-first, fall back to cached shell when offline.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() => caches.match(SHELL_FALLBACK)),
    );
    return;
  }

  // Static assets: cache-first, then network (and cache the result).
  e.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        }),
    ),
  );
});
