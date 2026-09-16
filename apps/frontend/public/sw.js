/// <reference lib="webworker" />
/** @type {ServiceWorkerGlobalScope} */

// Cache schema, not an app version. Build assets carry content hashes in their
// URLs; v2 retires the old cache that also stored mutable dev CSS and scripts.
const CACHE_NAME = "cadence-shell-v2";
const CACHE_PREFIX = "cadence-shell-";

function isHtml(response) {
    return response.ok && !response.redirected &&
        response.headers.get("content-type")?.includes("text/html");
}

// Offline support is best effort: a quota/write failure must not break loading.
function store(cache, request, response) {
    return cache.put(request, response).catch(() => {});
}

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const response = await fetch("/", { cache: "reload" });
        if (isHtml(response)) await store(await caches.open(CACHE_NAME), "/", response);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api")) return;

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            try {
                const response = await fetch(request);
                if (isHtml(response)) event.waitUntil(store(cache, "/", response.clone()));
                return response;
            } catch {
                return (await cache.match("/")) ?? new Response("Offline", { status: 503 });
            }
        })());
        return;
    }

    // Only immutable build assets belong in the asset cache. Public scripts,
    // /app/*.css and Vite module requests must always reach the network.
    const asset = /^\/assets\/.+-[\w-]{8,}\.(js|css|woff2|png|ico|svg|webp)$/.exec(url.pathname);
    if (!asset || url.search) return;
    const contentTypes = {
        js: /^(text|application)\/(javascript|ecmascript)\b/i,
        css: /^text\/css\b/i,
        woff2: /^(font\/woff2|application\/font-woff2)\b/i,
        png: /^image\/png\b/i,
        ico: /^image\/(x-icon|vnd\.microsoft\.icon)\b/i,
        svg: /^image\/svg\+xml\b/i,
        webp: /^image\/webp\b/i,
    };
    const isAsset = (response) => response.ok && !response.redirected &&
        contentTypes[asset[1]].test(response.headers.get("content-type") ?? "");

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached && isAsset(cached)) return cached;
        const response = await fetch(request);
        // Never persist an error or the SPA's HTML fallback as CSS/JavaScript.
        if (isAsset(response)) event.waitUntil(store(cache, request, response.clone()));
        return response;
    })());
});
