// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import worker from "../worker";

function assetEnv(response: Response): Env {
    return { ASSETS: { fetch: vi.fn().mockResolvedValue(response), connect: vi.fn() }, BACKEND: { fetch: vi.fn(), connect: vi.fn() }, NEON_AUTH_BASE_URL: "https://auth.test" };
}

describe("same-origin API", () => {
    it("hands /api/v1 requests to the backend binding untouched", async () => {
        const env = assetEnv(new Response("shell"));
        const answer = new Response("{}", { headers: { "server-timing": "db;dur=5" } });
        vi.mocked(env.BACKEND.fetch).mockResolvedValue(answer);
        const request = new Request("https://cadence.test/api/v1/tasks?state=ACTIVE", { headers: { authorization: "Bearer t", "cf-connecting-ip": "1.2.3.4" } });
        expect(await worker.fetch(request, env)).toBe(answer);
        expect(env.BACKEND.fetch).toHaveBeenCalledWith(request);
        expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    });
});

describe("hashed asset caching", () => {
    it.each([200, 304])("keeps successful and revalidated hashed assets immutable (%s)", async (status) => {
        const upstream = new Response(status === 304 ? null : "code", { status, headers: { "content-type": "application/javascript", "cache-control": "public, max-age=0, must-revalidate" } });
        const env = assetEnv(upstream);
        const response = await worker.fetch(new Request("https://cadence.test/assets/entry-abcdefgh.js"), env);
        expect(response.status).toBe(status);
        expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    });
    it("never turns a missing hashed chunk's SPA fallback into immutable HTML", async () => {
        const env = assetEnv(new Response("shell", { headers: { "content-type": "text/html" } }));
        const response = await worker.fetch(new Request("https://cadence.test/assets/missing-abcdefgh.js"), env);
        expect(response.status).toBe(404);
        expect(response.headers.get("cache-control")).toBe("no-store");
    });
    it("leaves mutable files on their current caching policy", async () => {
        const upstream = new Response("code", { headers: { "content-type": "application/javascript", "cache-control": "no-cache" } });
        const env = assetEnv(upstream);
        const response = await worker.fetch(new Request("https://cadence.test/assets/mutable.js"), env);
        expect(response.headers.get("cache-control")).toBe("no-cache");
    });
});
