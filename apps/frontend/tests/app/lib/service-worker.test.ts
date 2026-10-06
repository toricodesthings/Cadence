// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { DEV_SERVICE_WORKER_CLEANUP_SCRIPT } from "../../../app/lib/dev-service-worker-cleanup";

const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const origin = "https://cadence.test";

function worker(cached?: Response, assets: string[] = []) {
    const handlers: Record<string, (event: any) => void> = {};
    const cache = { match: vi.fn().mockResolvedValue(cached), put: vi.fn().mockResolvedValue(undefined) };
    const caches = {
        open: vi.fn().mockResolvedValue(cache),
        keys: vi.fn().mockResolvedValue(["cadence-shell-2026-03-26", "cadence-shell-v2", "cadence-shell-v3", "other-app"]),
        delete: vi.fn().mockResolvedValue(true),
    };
    const fetch = vi.fn().mockResolvedValue(new Response("body{}", { headers: { "content-type": "text/css" } }));
    const self = { location: { origin }, addEventListener: (name: string, handler: any) => { handlers[name] = handler; },
        skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
    runInNewContext(source.replace("/*__PRECACHE__*/[]", JSON.stringify(assets)), { self, caches, fetch, URL, Response, AbortSignal, setTimeout, clearTimeout });
    async function request(path: string, mode = "cors") {
        const pending: Promise<unknown>[] = [];
        let response: Promise<Response> | undefined;
        handlers.fetch({ request: { method: "GET", url: new URL(path, origin).href, mode },
            respondWith: (value: Promise<Response>) => { response = value; },
            waitUntil: (value: Promise<unknown>) => pending.push(value) });
        const result = await response;
        await Promise.all(pending);
        return result;
    }
    return { cache, caches, fetch, handlers, request, self };
}

describe("shell caching", () => {
    it("retries missing or invalid precache entries when the tab reconnects", async () => {
        const path = "/assets/shared-abcdefgh.js";
        const w = worker(new Response("wrong shell", { headers: { "content-type": "text/html" } }), [path]);
        w.fetch.mockRejectedValueOnce(new Error("Offline"));
        let first: Promise<unknown> | undefined;
        w.handlers.message({ data: { type: "cadence-precache" }, waitUntil: (p: Promise<unknown>) => { first = p; } });
        await first;
        expect(w.cache.put).not.toHaveBeenCalled();
        w.fetch.mockResolvedValueOnce(new Response("code", { headers: { "content-type": "application/javascript" } }));
        let retry: Promise<unknown> | undefined;
        w.handlers.message({ data: { type: "cadence-precache" }, waitUntil: (p: Promise<unknown>) => { retry = p; } });
        await retry;
        expect(w.cache.put).toHaveBeenCalledWith(path, expect.any(Response));
    });
    it("bounds installation to three downloads and continues past already cached assets", async () => {
        const paths = Array.from({ length: 8 }, (_, i) => `/assets/chunk-${i}abcdefgh.js`);
        const w = worker(undefined, paths);
        w.cache.match.mockImplementation(async (path) => path === paths[0] ? new Response("saved", { headers: { "content-type": "application/javascript" } }) : undefined);
        const downloads: ReturnType<typeof Promise.withResolvers<Response>>[] = [];
        let active = 0, peak = 0;
        w.fetch.mockImplementation((path) => {
            if (path === "/") return Promise.resolve(new Response("shell", { headers: { "content-type": "text/html" } }));
            active++; peak = Math.max(peak, active);
            const pending = Promise.withResolvers<Response>(); downloads.push(pending);
            return pending.promise.finally(() => { active--; });
        });
        let install: Promise<unknown> | undefined;
        w.handlers.install({ waitUntil: (p: Promise<unknown>) => { install = p; } });
        await vi.waitFor(() => expect(downloads).toHaveLength(3));
        for (let i = 0; i < 7; i++) {
            await vi.waitFor(() => expect(downloads[i]).toBeDefined());
            downloads[i].resolve(new Response("code", { headers: { "content-type": "application/javascript" } }));
        }
        await install;
        expect(peak).toBe(3);
        expect(downloads).toHaveLength(7);
        expect(w.self.skipWaiting).toHaveBeenCalledOnce();
    });
    it("falls back to a validated cached shell after a stalled navigation and keeps late network recovery", async () => {
        vi.useFakeTimers();
        try {
            const shell = new Response("shell", { headers: { "content-type": "text/html" } });
            const w = worker(shell);
            const network = Promise.withResolvers<Response>();
            w.fetch.mockReturnValueOnce(network.promise);
            const work: Promise<unknown>[] = [];
            let response: Promise<Response> | undefined;
            w.handlers.fetch({ request: { method: "GET", url: `${origin}/today`, mode: "navigate" },
                respondWith: (p: Promise<Response>) => { response = p; }, waitUntil: (p: Promise<unknown>) => work.push(p) });
            await vi.advanceTimersByTimeAsync(20_001);
            expect(await response).toBe(shell);
            network.resolve(new Response("fresh", { headers: { "content-type": "text/html" } }));
            await Promise.all(work);
            expect(w.cache.put).toHaveBeenCalled();
        } finally { vi.useRealTimers(); }
    });
    it("lets mutable dev styles, modules, public scripts and API requests reach the network", async () => {
        const w = worker();
        for (const path of ["/app/app.css", "/app/root.tsx", "/register-sw.js", "/sw.js", "/@vite/client", "/api/tasks", "/assets/app-abcdefgh.css?t=123"]) {
            expect(await w.request(path)).toBeUndefined();
        }
        expect(w.caches.open).not.toHaveBeenCalled();
    });
    it("caches successful hashed CSS and reuses a valid cached response", async () => {
        const w = worker();
        expect((await w.request("/assets/app-abcdefgh.css"))?.status).toBe(200);
        expect(w.cache.put).toHaveBeenCalledOnce();
        const cached = new Response("cached{}", { headers: { "content-type": "text/css" } });
        const warm = worker(cached);
        expect(await warm.request("/assets/app-abcdefgh.css")).toBe(cached);
        expect(warm.fetch).not.toHaveBeenCalled();
    });
    it("leaves auth navigations to the network even when an offline shell exists", async () => {
        const w = worker(new Response("<html>offline shell</html>"));
        for (const path of ["/auth", "/auth/sign-in", "/auth/callback", "/auth/callback?neon_auth_session_verifier=one-time"]) {
            expect(await w.request(path, "navigate")).toBeUndefined();
        }
        expect(w.fetch).not.toHaveBeenCalled();
        expect(w.caches.open).not.toHaveBeenCalled();
    });
    it("does not replace the offline shell with no-store navigation responses", async () => {
        const w = worker();
        w.fetch.mockResolvedValue(new Response("<html>private response</html>", {
            headers: { "content-type": "text/html", "cache-control": "private, no-store" },
        }));
        expect((await w.request("/today", "navigate"))?.status).toBe(200);
        expect(w.cache.put).not.toHaveBeenCalled();
    });
    it.each([200, 404, 500])("never caches HTML or error responses as CSS (status %s)", async (status) => {
        const w = worker(new Response("<html>stale fallback</html>", { headers: { "content-type": "text/html" } }));
        w.fetch.mockResolvedValue(new Response("<html>fallback</html>", { status, headers: { "content-type": "text/html" } }));
        await w.request("/assets/app-abcdefgh.css");
        expect(w.fetch).toHaveBeenCalledOnce();
        expect(w.cache.put).not.toHaveBeenCalled();
    });
    it("serves the saved shell at once and never replaces it with an error page", async () => {
        const shell = new Response("<html>offline shell</html>", { headers: { "content-type": "text/html" } });
        const w = worker(shell);
        w.fetch.mockResolvedValueOnce(new Response("Error", { status: 500 }));
        expect(await w.request("/today", "navigate")).toBe(shell);
        expect(w.cache.put).not.toHaveBeenCalled();
        w.fetch.mockRejectedValueOnce(new Error("Offline"));
        expect(await w.request("/today", "navigate")).toBe(shell);
    });
    it("removes legacy shell caches without deleting other application caches", async () => {
        const w = worker();
        let activation: Promise<unknown> | undefined;
        w.handlers.activate({ waitUntil: (p: Promise<unknown>) => { activation = p; } });
        await activation;
        expect(w.caches.delete.mock.calls).toEqual([["cadence-shell-2026-03-26"], ["cadence-shell-v2"]]);
        expect(w.self.clients.claim).toHaveBeenCalledOnce();
    });
});

describe("development worker cleanup", () => {
    it.each([true, false])("unregisters only Cadence's preview worker and reloads only controlled tabs (%s)", async (controlled) => {
        const registration = { active: { scriptURL: `${origin}/sw.js` }, unregister: vi.fn().mockResolvedValue(true) };
        const other = { active: { scriptURL: `${origin}/other-worker.js` }, unregister: vi.fn() };
        const reload = vi.fn();
        const caches = { keys: async () => ["cadence-shell-2026-03-26", "workspace-data"], delete: vi.fn() };
        await runInNewContext(DEV_SERVICE_WORKER_CLEANUP_SCRIPT, {
            navigator: { serviceWorker: { controller: controlled ? registration.active : null, getRegistrations: async () => [registration, other] } },
            location: { origin, reload }, window: { caches }, caches, URL, console,
        });
        expect(registration.unregister).toHaveBeenCalledOnce();
        expect(other.unregister).not.toHaveBeenCalled();
        expect(caches.delete.mock.calls).toEqual([["cadence-shell-2026-03-26"]]);
        expect(reload).toHaveBeenCalledTimes(controlled ? 1 : 0);
    });
});
