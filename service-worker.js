const CACHE_NAME = "maleducados-leaderboard-v3";
const APP_SHELL = [
  "index.html",
  "styles.css",
  "app.js",
  "admin.js",
  "data.js",
  "firebase-config.js",
  "manifest.webmanifest",
  "assets/brand/isotipo-transparent.png",
  "assets/brand/logo.png",
  "assets/brand/icon-180.png",
  "assets/brand/icon-192.png",
  "assets/brand/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(APP_SHELL.map((path) => cache.add(new URL(path, self.registration.scope).href)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(new URL("index.html", self.registration.scope).href))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) =>
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error())
    )
  );
});
