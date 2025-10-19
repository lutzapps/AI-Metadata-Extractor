/*
    with runtime caching and offline fallback 

    ✅ Now, when a user is offline and requests a page that isn’t cached,
    they’ll see our 'offline.html' instead of a sad broken browser error.
    Cached stuff (index, icons, manifest, etc.) still works as usual.
*/

const APP_SHELL_CACHE = "metaextractor-shell-v1";
const RUNTIME_CACHE = "metaextractor-runtime-v1";

const ASSETS_TO_CACHE = [
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/res/favicon-16.png",
  "/res/favicon-32.png",
  "/res/favicon-180.png",
  "/res/favicon-512.png",
  "/res/favicon-1024.png",
  "/res/favicon.ico"
];

// Install - cache app shell & offline page
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate - cleanup old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== APP_SHELL_CACHE && k !== RUNTIME_CACHE)
            .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch - cache-first for shell, network+runtime caching for others
self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET")
        return;

    event.respondWith(
        caches.match(request).then(cachedResponse => {
            if (cachedResponse)
                return cachedResponse;

            return fetch(request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const cloned = networkResponse.clone();
                    caches.open(RUNTIME_CACHE).then(cache => {
                        //cache.put(request, cloned)
                        // respect cach-limit (round-robin)
                        cache.put(request, cloned).then(() => main.enforceRuntimeCacheLimit());
                    });

                }
                return networkResponse;
            }).catch(() => {
                // Offline fallback
                if (request.destination === "document") {
                    return caches.match("offline.html");
                }
            });
        })
    );
});

// Listen for cache reset command
self.addEventListener("message", event => {
  if (event.data === "clear-runtime-cache") {
    caches.delete(RUNTIME_CACHE).then(() => {
      console.log("🧹 Runtime cache cleared");
    });
  }
});