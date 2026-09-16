// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { DEV_SERVICE_WORKER_CLEANUP_SCRIPT } from "../../../app/lib/dev-service-worker-cleanup";

const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const origin = "https://cadence.test";

function worker(cached?: Response) {
    const handlers: Record<string, (event: any) => void> = {};
    const cache = { match: vi.fn().mockResolvedValue(cached), put: vi.fn().mockResolvedValue(undefined) };
    const caches = {
        open: vi.fn().mockResolvedValue(cache),
        keys: vi.fn().mockResolvedValue(["cadence-shell-2026-03-26", "cadence-shell-v2", "other-app"]),
        delete: vi.fn().mockResolvedValue(true),
    };
    const fetch = vi.fn().mockResolvedValue(new Response("body{}", { headers: { "content-type": "text/css" } }));
    const self = { location: { origin }, addEventListener: (name: string, handler: any) => { handlers[name] = handler; },
        skipWaiting: vi.fn(), clients: { claim: vi.fn() } };
    runInNewContext(source, { self, caches, fetch, URL, Response });
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
    it.each([200, 404, 500])("never caches HTML or error responses as CSS (status %s)", async (status) => {
        const w = worker(new Response("<html>stale fallback</html>", { headers: { "content-type": "text/html" } }));
        w.fetch.mockResolvedValue(new Response("<html>fallback</html>", { status, headers: { "content-type": "text/html" } }));
        await w.request("/assets/app-abcdefgh.css");
        expect(w.fetch).toHaveBeenCalledOnce();
        expect(w.cache.put).not.toHaveBeenCalled();
    });
    it("keeps a valid offline shell when the network returns an error page", async () => {
        const shell = new Response("<html>offline shell</html>");
        const w = worker(shell);
        w.fetch.mockResolvedValueOnce(new Response("Error", { status: 500 }));
        expect((await w.request("/today", "navigate"))?.status).toBe(500);
        expect(w.cache.put).not.toHaveBeenCalled();
        w.fetch.mockRejectedValueOnce(new Error("Offline"));
        expect(await w.request("/today", "navigate")).toBe(shell);
    });
    it("removes legacy shell caches without deleting other application caches", async () => {
        const w = worker();
        let activation: Promise<unknown> | undefined;
        w.handlers.activate({ waitUntil: (p: Promise<unknown>) => { activation = p; } });
        await activation;
        expect(w.caches.delete.mock.calls).toEqual([["cadence-shell-2026-03-26"]]);
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
