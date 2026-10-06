/// <reference lib="webworker" />
/** @type {ServiceWorkerGlobalScope} */

// Cache schema, not an app version. Build assets carry content hashes in their
// URLs; v3 retires shells that could contain a one-time OAuth callback response.
const CACHE_NAME = "cadence-shell-v3";
const CACHE_PREFIX = "cadence-shell-";
// Every web build asset, written in by react-router.config.ts `buildEnd`.
const PRECACHE = /*__PRECACHE__*/[];
// The asset list the cache was last pruned to, so an open older tab keeps its chunks.
const MANIFEST_KEY = "/__cadence-precache__";

function isHtml(response) {
    return response.ok && !response.redirected &&
        !/\bno-store\b/i.test(response.headers.get("cache-control") ?? "") &&
        response.headers.get("content-type")?.includes("text/html");
}

// Only immutable build assets belong in the asset cache. Public scripts,
// /app/*.css and Vite module requests must always reach the network.
const ASSET_TYPES = {
    js: /^(text|application)\/(javascript|ecmascript)\b/i,
    css: /^text\/css\b/i,
    woff2: /^(font\/woff2|application\/font-woff2)\b/i,
    png: /^image\/png\b/i,
    ico: /^image\/(x-icon|vnd\.microsoft\.icon)\b/i,
    svg: /^image\/svg\+xml\b/i,
    webp: /^image\/webp\b/i,
};

function assetType(url) {
    return url.search ? null : /^\/assets\/.+-[\w-]{8,}\.(js|css|woff2|png|ico|svg|webp)$/.exec(url.pathname)?.[1] ?? null;
}

// Never persist an error or the SPA's HTML fallback as CSS/JavaScript.
function isAsset(type, response) {
    return response.ok && !response.redirected && ASSET_TYPES[type].test(response.headers.get("content-type") ?? "");
}

// Offline support is best effort: a quota/write failure must not break loading.
function store(cache, request, response) {
    return cache.put(request, response).catch(() => {});
}

let assetWarming;
function warmAssets(cache) {
    if (assetWarming) return assetWarming;
    assetWarming = (async () => {
        const pending = PRECACHE.values();
        const warm = async () => {
            for (const path of pending) {
                const type = assetType(new URL(path, self.location.origin));
                const saved = await cache.match(path);
                if (type && saved && isAsset(type, saved)) continue;
                const asset = await fetch(path, { priority: "low", signal: AbortSignal.timeout(20_000) }).catch(() => null);
                if (type && asset && isAsset(type, asset)) await store(cache, path, asset);
            }
        };
        await Promise.all(Array.from({ length: 3 }, warm));
    })().finally(() => { assetWarming = undefined; });
    return assetWarming;
}

// A reconnect/return retries assets missed during installation, keeping full coverage automatic.
self.addEventListener("message", (event) => {
    if (event.data?.type === "cadence-precache") event.waitUntil(caches.open(CACHE_NAME).then(warmAssets));
});

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        const response = await fetch("/", { cache: "reload" });
        if (isHtml(response)) await store(cache, "/", response);
        await warmAssets(cache);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)));

        // Keep this build's assets and the previous build's; drop anything older.
        const cache = await caches.open(CACHE_NAME);
        const previous = await (await cache.match(MANIFEST_KEY))?.json().catch(() => null);
        if (Array.isArray(previous) && PRECACHE.length) {
            const keep = new Set([...previous, ...PRECACHE]);
            const requests = await cache.keys();
            await Promise.all(requests.map((request) => {
                const { pathname } = new URL(request.url);
                return pathname.startsWith("/assets/") && !keep.has(pathname) ? cache.delete(request) : null;
            }));
        }
        if (PRECACHE.length) await store(cache, MANIFEST_KEY, Response.json(PRECACHE));
        await self.registration?.navigationPreload?.enable();
        await self.clients.claim();
    })());
});

// Reminders are shown through the registration (the only way on iOS), so a
// tap has to bring the app forward here.
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil((async () => {
        const [client] = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (client) return client.focus();
        return self.clients.openWindow("/");
    })());
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api")) return;
    // Auth navigations must reach the browser's network stack directly. Never
    // cache a callback as the offline shell or substitute a shell for it.
    if (url.pathname === "/auth" || url.pathname.startsWith("/auth/")) return;

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            try {
                // Stale-while-revalidate: a validated cached shell opens at once; its assets are
                // precached (this build and the previous one), and a newer deploy is announced by
                // the app's update toast. The fresh shell is saved for the next visit.
                const saved = await cache.match("/");
                const network = (async () => (await event.preloadResponse) || fetch(request))();
                event.waitUntil(network.then((fresh) => isHtml(fresh) ? store(cache, "/", fresh.clone()) : undefined).catch(() => {}));
                if (saved && isHtml(saved)) return saved;
                return await network;
            } catch {
                const saved = await cache.match("/");
                return saved && isHtml(saved) ? saved : new Response("Offline", { status: 503 });
            }
        })());
        return;
    }

    const type = assetType(url);
    if (!type) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached && isAsset(type, cached)) return cached;
        const response = await fetch(request);
        if (isAsset(type, response)) event.waitUntil(store(cache, request, response.clone()));
        return response;
    })());
});

// ── Background Sync (Chromium/Android only) ──
// Changes made offline sync after the app is closed. An open app replays them
// itself, so it is only asked to. Otherwise this replays the app's queue
// (idb-keyval's store) with the same locks and Idempotency-Keys the app uses,
// and any failure it can retry rejects, so the browser tries again later.

const WAL_PREFIX = "cadence-mutation-wal:";

function idb(mode, run) {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onupgradeneeded = () => open.result.createObjectStore("keyval");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const tx = open.result.transaction("keyval", mode);
            const request = run(tx.objectStore("keyval"));
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = () => reject(tx.error);
        };
    });
}

async function changeQueue(userId, change) {
    const key = WAL_PREFIX + userId;
    await navigator.locks.request(`cadence-wal:${userId}`, async () => {
        const next = change((await idb("readonly", (s) => s.get(key))) ?? []);
        await idb("readwrite", (s) => (next.length ? s.put(next, key) : s.delete(key)));
    });
    new BroadcastChannel("cadence-wal").postMessage(userId);
}

async function replayQueue(userId) {
    const response = await fetch("/api/auth/token", { credentials: "include", cache: "no-store" });
    const { token } = response.ok ? await response.json() : {};
    if (!token) throw new Error("No session");

    for (;;) {
        const entries = (await idb("readonly", (s) => s.get(WAL_PREFIX + userId))) ?? [];
        if (entries.some((e) => e.status === "failed")) return; // The app shows and orders these.
        const entry = entries.find((e) => e.status === "pending");
        if (!entry) return;
        if (!entry.requests) throw new Error("Queued by an older version"); // The app replays it.

        for (const [index, request] of entry.requests.entries()) {
            const key = request.key ?? entry.id;
            const res = await fetch(request.url, {
                method: request.method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Idempotency-Key": index ? `${key}:${index}` : key,
                    ...(request.json !== undefined && { "Content-Type": "application/json" }),
                },
                body: request.json === undefined ? undefined : JSON.stringify(request.json),
            });
            if (res.ok || (res.status === 404 && !entry.op.type.startsWith("create_"))) continue;
            if (res.status === 401 || res.status === 429 || res.status >= 500) throw new Error(`Retry later (${res.status})`);
            if (res.status === 409) return; // A conflict: the app keeps both versions of a note.
            const body = await res.json().catch(() => null);
            await changeQueue(userId, (all) => all.map((e) => (e.id === entry.id
                ? { ...e, status: "failed", error: body?.error?.message ?? `Request failed with status ${res.status}` }
                : e)));
            return;
        }
        await changeQueue(userId, (all) => all.filter((e) => e.id !== entry.id));
    }
}

self.addEventListener("sync", (event) => {
    if (event.tag !== "cadence-wal") return;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: "window" });
        if (windows.length) {
            for (const client of windows) client.postMessage({ type: "cadence-wal-replay" });
            return;
        }
        const keys = await idb("readonly", (s) => s.getAllKeys());
        for (const key of keys.filter((k) => typeof k === "string" && k.startsWith(WAL_PREFIX))) {
            const userId = key.slice(WAL_PREFIX.length);
            // Another replay (a tab opening right now) already holds it: let that one finish.
            await navigator.locks.request(`cadence-wal-replay:${userId}`, { ifAvailable: true },
                (lock) => (lock ? replayQueue(userId) : undefined));
        }
    })());
});
