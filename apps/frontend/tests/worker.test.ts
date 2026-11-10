// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../worker";

function assetEnv(response: Response): Env {
    return { ASSETS: { fetch: vi.fn().mockResolvedValue(response), connect: vi.fn() }, BACKEND: { fetch: vi.fn(), connect: vi.fn() }, NEON_AUTH_BASE_URL: "https://auth.test" } as unknown as Env;
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

describe("missing assets", () => {
    it("never turns a missing hashed chunk's SPA fallback into cached HTML", async () => {
        const env = assetEnv(new Response("shell", { headers: { "content-type": "text/html" } }));
        const response = await worker.fetch(new Request("https://cadence.test/assets/missing-abcdefgh.js"), env);
        expect(response.status).toBe(404);
        expect(response.headers.get("cache-control")).toBe("no-store");
    });
});

/** A limiter binding that allows `allowed` calls per key. */
function limiter(allowed: number) {
    const seen = new Map<string, number>();
    return {
        limit: vi.fn(async ({ key }: { key: string }) => {
            seen.set(key, (seen.get(key) ?? 0) + 1);
            return { success: seen.get(key)! <= allowed };
        }),
    };
}

function authEnv() {
    return {
        ...assetEnv(new Response("shell")),
        AUTH_LIMITER: limiter(300),
        AUTH_SENSITIVE_LIMITER: limiter(10),
        AUTH_EMAIL_LIMITER: limiter(3),
    } as unknown as Env;
}

const post = (path: string, body: object, ip = "203.0.113.9") =>
    new Request(`https://cadence.test/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": ip },
        body: JSON.stringify(body),
    });

describe("sign-in proxy limits", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("refuses the 11th sensitive POST from one IP without reaching Neon Auth", async () => {
        const upstream = vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
        vi.stubGlobal("fetch", upstream);
        const env = authEnv();
        for (let i = 0; i < 10; i++) expect((await worker.fetch(post("sign-in/email", { email: `a${i}@x.dev`, password: "p" }), env)).status).toBe(200);
        const refused = await worker.fetch(post("sign-in/email", { email: "b@x.dev", password: "p" }), env);
        expect(refused.status).toBe(429);
        expect(refused.headers.get("retry-after")).toBe("60");
        expect(await refused.json()).toMatchObject({ code: "RATE_LIMITED" });
        expect(upstream).toHaveBeenCalledTimes(10);
    });

    it("never counts a get-session read as sensitive", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
        const env = authEnv();
        await worker.fetch(new Request("https://cadence.test/api/auth/get-session", { headers: { "cf-connecting-ip": "203.0.113.9" } }), env);
        expect((env.AUTH_LIMITER.limit as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
        expect((env.AUTH_SENSITIVE_LIMITER.limit as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it("refuses the 4th code for one address from a different IP, and forwards the same bytes", async () => {
        const upstream = vi.fn(async (_url: unknown, init: RequestInit) => new Response(init.body as ArrayBuffer));
        vi.stubGlobal("fetch", upstream);
        const env = authEnv();
        for (let i = 0; i < 3; i++) await worker.fetch(post("email-otp/send-verification-otp", { email: "Me@X.dev", type: "sign-in" }, `198.51.100.${i}`), env);
        const refused = await worker.fetch(post("email-otp/send-verification-otp", { email: "me@x.dev", type: "sign-in" }, "198.51.100.99"), env);
        expect(refused.status).toBe(429);
        expect(new TextDecoder().decode(upstream.mock.calls[0][1].body as ArrayBuffer)).toBe(JSON.stringify({ email: "Me@X.dev", type: "sign-in" }));
    });

    it("works with no limiter bindings (local preview)", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
        expect((await worker.fetch(post("sign-in/email", { email: "a@x.dev" }), assetEnv(new Response("shell")))).status).toBe(200);
    });
});

describe("worker-made responses", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends nosniff on the auth proxy and a nonce-only CSP on the callback page", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
        const env = assetEnv(new Response("shell"));
        const proxied = await worker.fetch(new Request("https://cadence.test/api/auth/get-session"), env);
        expect(proxied.headers.get("x-content-type-options")).toBe("nosniff");

        const callback = await worker.fetch(new Request("https://cadence.test/auth/callback?neon_auth_session_verifier=v", {
            headers: { cookie: "__Secure-neon-auth.session_challenge=c" },
        }), env);
        const csp = callback.headers.get("content-security-policy")!;
        const nonce = /'nonce-([a-f0-9]+)'/.exec(csp)![1];
        expect(csp).toContain("default-src 'none'");
        expect(await callback.text()).toContain(`<script nonce="${nonce}">`);
        expect(callback.headers.get("x-content-type-options")).toBe("nosniff");
    });
});
