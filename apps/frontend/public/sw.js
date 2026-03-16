/// <reference lib="webworker" />
/** @type {ServiceWorkerGlobalScope} */

// Cache version is bumped with each release to force invalidation.
// Update this string whenever you deploy a new build.
const CACHE_VERSION = "2026-03-16";
const CACHE_NAME = `cadence-shell-${CACHE_VERSION}`;

// Cache the app shell on install
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(["/"])),
    );
    self.skipWaiting();
});

// Clean old caches on activate
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
        ),
    );
    self.clients.claim();
});

// Network-first for navigations, cache-first for static assets, network-only for API
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET and cross-origin
    if (request.method !== "GET" || url.origin !== self.location.origin) return;

    // API calls — network only
    if (url.pathname.startsWith("/api")) return;

    // Navigation — network first, fall back to cached shell
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put("/", clone));
                    return res;
                })
                .catch(() => caches.match("/").then((r) => r ?? new Response("Offline", { status: 503 }))),
        );
        return;
    }

    // Static assets — cache first, update in background
    if (
        url.pathname.startsWith("/assets/") ||
        url.pathname.endsWith(".js") ||
        url.pathname.endsWith(".css") ||
        url.pathname.endsWith(".woff2") ||
        url.pathname.endsWith(".png") ||
        url.pathname.endsWith(".ico")
    ) {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ??
                    fetch(request).then((res) => {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                        return res;
                    }),
            ),
        );
        return;
    }
});
