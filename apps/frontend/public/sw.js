/// <reference lib="webworker" />

const CACHE_NAME = "cadence-shell-v3";
const CACHE_PREFIX = "cadence-shell-";
const PRECACHE = /*__PRECACHE__*/ [];
const MANIFEST_KEY = "/__cadence-precache__";

function isHtml(response) {
    return (
        response.ok &&
        !response.redirected &&
        !/\bno-store\b/i.test(response.headers.get("cache-control") ?? "") &&
        response.headers.get("content-type")?.includes("text/html")
    );
}

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
    return url.search
        ? null
        : (/^\/assets\/.+-[\w-]{8,}\.(js|css|woff2|png|ico|svg|webp)$/.exec(url.pathname)?.[1] ?? null);
}

function isAsset(type, response) {
    return response.ok && !response.redirected && ASSET_TYPES[type].test(response.headers.get("content-type") ?? "");
}

function store(cache, request, response) {
    return cache.put(request, response).catch(() => undefined);
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
                const asset = await fetch(path, { priority: "low", signal: AbortSignal.timeout(20_000) }).catch(
                    () => null,
                );
                if (type && asset && isAsset(type, asset)) await store(cache, path, asset);
            }
        };
        await Promise.all(Array.from({ length: 3 }, warm));
    })().finally(() => {
        assetWarming = undefined;
    });
    return assetWarming;
}

async function refreshShell() {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch("/", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (isHtml(response)) await store(cache, "/", response);
}

self.addEventListener("message", (event) => {
    if (event.data?.type === "cadence-precache") event.waitUntil(caches.open(CACHE_NAME).then(warmAssets));
    if (event.data?.type === "cadence-refresh-shell") {
        event.waitUntil(
            refreshShell()
                .catch(() => undefined)
                .finally(() => event.ports[0]?.postMessage("done")),
        );
    }
});

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const response = await fetch("/", { cache: "reload" });
            if (isHtml(response)) await store(cache, "/", response);
            await warmAssets(cache);
            await self.skipWaiting();
        })(),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                    .map((key) => caches.delete(key)),
            );

            const cache = await caches.open(CACHE_NAME);
            const previous = await (await cache.match(MANIFEST_KEY))?.json().catch(() => null);
            if (Array.isArray(previous) && PRECACHE.length) {
                const keep = new Set([...previous, ...PRECACHE]);
                const requests = await cache.keys();
                await Promise.all(
                    requests.map((request) => {
                        const { pathname } = new URL(request.url);
                        return pathname.startsWith("/assets/") && !keep.has(pathname) ? cache.delete(request) : null;
                    }),
                );
            }
            if (PRECACHE.length) await store(cache, MANIFEST_KEY, Response.json(PRECACHE));
            await self.registration?.navigationPreload?.enable();
            await self.clients.claim();
        })(),
    );
});

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {}
    if (!data || typeof data !== "object") data = {};
    const message = data.notification && typeof data.notification === "object" ? data.notification : data;
    event.waitUntil(
        Promise.all([
            self.registration.showNotification(message.title || "Cadence", {
                body: message.body || "",
                icon: "/icon-192.png",
                tag: message.tag || undefined,
                data: { route: sameOriginRoute(message.navigate) ?? data.route ?? "/" },
            }),
            message.tag === "cadence-test" ? null : raiseBadge(),
        ]),
    );
});

function sameOriginRoute(href) {
    if (typeof href !== "string") return null;
    try {
        const url = new URL(href, self.location.origin);
        return url.origin === self.location.origin ? url.pathname + url.search : null;
    } catch {
        return null;
    }
}

const APP_BADGE_KEY = "cadence-app-badge";
async function raiseBadge() {
    try {
        if (!self.navigator?.setAppBadge) return;
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (windows.some((client) => client.visibilityState === "visible")) return;
        const count = (Number(await idb("readonly", (s) => s.get(APP_BADGE_KEY))) || 0) + 1;
        await idb("readwrite", (s) => s.put(count, APP_BADGE_KEY));
        await self.navigator.setAppBadge(count);
    } catch {}
}

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const route = event.notification.data?.route;
    const target = typeof route === "string" && route.startsWith("/") && !route.startsWith("//") ? route : "/";
    event.waitUntil(
        (async () => {
            const [client] = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            if (!client) return self.clients.openWindow(target);
            await client.focus();
            client.postMessage({ type: "cadence:open", route: target });
        })(),
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api")) return;
    if (url.pathname === "/auth" || url.pathname.startsWith("/auth/")) return;

    if (request.mode === "navigate") {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                try {
                    const saved = await cache.match("/");
                    const network = (async () => (await event.preloadResponse) || fetch(request))();
                    event.waitUntil(
                        network
                            .then((fresh) => (isHtml(fresh) ? store(cache, "/", fresh.clone()) : undefined))
                            .catch(() => undefined),
                    );
                    if (saved && isHtml(saved)) return saved;
                    return await network;
                } catch {
                    const saved = await cache.match("/");
                    return saved && isHtml(saved) ? saved : new Response("Offline", { status: 503 });
                }
            })(),
        );
        return;
    }

    const type = assetType(url);
    if (!type) return;

    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request);
            if (cached && isAsset(type, cached)) return cached;
            const response = await fetch(request);
            if (isAsset(type, response)) event.waitUntil(store(cache, request, response.clone()));
            return response;
        })(),
    );
});

const WAL_PREFIX = "cadence-mutation-wal:";

function idb(mode, run) {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onupgradeneeded = () => open.result.createObjectStore("keyval");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("keyval", mode);
            const request = run(tx.objectStore("keyval"));
            tx.oncomplete = () => {
                db.close?.();
                resolve(request.result);
            };
            tx.onerror = () => {
                db.close?.();
                reject(tx.error);
            };
            tx.onabort = () => {
                db.close?.();
                reject(tx.error ?? new Error("Transaction aborted"));
            };
        };
    });
}

async function changeQueue(userId, change) {
    const key = WAL_PREFIX + userId;
    await navigator.locks.request(`cadence-wal:${userId}`, async () => {
        const next = change((await idb("readonly", (s) => s.get(key))) ?? []);
        await idb("readwrite", (s) => (next.length ? s.put(next, key) : s.delete(key)));
    });
    const channel = new BroadcastChannel("cadence-wal");
    channel.postMessage(userId);
    channel.close?.();
}

function jwtSub(token) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
        return typeof payload?.sub === "string" ? payload.sub : null;
    } catch {
        return null;
    }
}

function isOwnApi(href) {
    try {
        const url = new URL(href, self.location.origin);
        return url.origin === self.location.origin && url.pathname.startsWith("/api/v1/");
    } catch {
        return false;
    }
}

async function replayQueue(userId) {
    const response = await fetch("/api/auth/token", { credentials: "include", cache: "no-store" });
    const { token } = response.ok ? await response.json() : {};
    if (!token) throw new Error("No session");
    if (jwtSub(token) !== userId) return;

    for (;;) {
        const entries = (await idb("readonly", (s) => s.get(WAL_PREFIX + userId))) ?? [];
        if (entries.some((e) => e.status === "failed")) return;
        const entry = entries.find((e) => e.status === "pending");
        if (!entry) return;
        if (!entry.requests) throw new Error("Queued by an older version");

        if (entry.op.type === "upsert_note" && !entry.attempted) {
            await changeQueue(userId, (all) => all.map((e) => (e.id === entry.id ? { ...e, attempted: true } : e)));
        }
        if (!entry.requests.every((r) => isOwnApi(r.url))) throw new Error("Not this app's API");
        for (const [index, request] of entry.requests.entries()) {
            const key = request.key ?? entry.id;
            const res = await fetch(request.url, {
                method: request.method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Idempotency-Key": index ? `${key}:${index}` : key,
                    "X-Queued-At": new Date(entry.createdAt).toISOString(),
                    ...(request.json !== undefined && { "Content-Type": "application/json" }),
                },
                body: request.json === undefined ? undefined : JSON.stringify(request.json),
            });
            if (res.ok || (res.status === 404 && !entry.op.type.startsWith("create_"))) continue;
            if (res.status === 401 || res.status === 429 || res.status >= 500)
                throw new Error(`Retry later (${res.status})`);
            if (res.status === 409) return;
            const body = await res.json().catch(() => null);
            await changeQueue(userId, (all) =>
                all.map((e) =>
                    e.id === entry.id
                        ? {
                              ...e,
                              status: "failed",
                              error: body?.error?.message ?? `Request failed with status ${res.status}`,
                          }
                        : e,
                ),
            );
            return;
        }
        await changeQueue(userId, (all) => all.filter((e) => e.id !== entry.id));
    }
}

self.addEventListener("sync", (event) => {
    if (event.tag !== "cadence-wal") return;
    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({ type: "window" });
            if (windows.length) {
                for (const client of windows) client.postMessage({ type: "cadence-wal-replay" });
                return;
            }
            const keys = await idb("readonly", (s) => s.getAllKeys());
            for (const key of keys.filter((k) => typeof k === "string" && k.startsWith(WAL_PREFIX))) {
                const userId = key.slice(WAL_PREFIX.length);
                await navigator.locks.request(`cadence-wal-replay:${userId}`, { ifAvailable: true }, (lock) =>
                    lock ? replayQueue(userId) : undefined,
                );
            }
        })(),
    );
});
