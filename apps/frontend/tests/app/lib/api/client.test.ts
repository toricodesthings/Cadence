import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const platformFetchMock = vi.fn();
const tokenFetchMock = vi.fn();
const liveExpiry = Math.floor(Date.now() / 1000) + 3600;

type EchoedRequest = { headers: Record<string, string>; cache: string | null; method: string };

vi.mock("../../../../app/lib/env", () => ({
    API_BASE_URL: "https://api.example.test",
    NEON_AUTH_URL: "https://auth.example.test",
}));

vi.mock("../../../../app/lib/auth-client", () => ({
    authClient: {
        getSession: getSessionMock,
    },
}));

vi.mock("../../../../app/platform/runtime", () => ({
    IS_DESKTOP_RUNTIME: false,
    platformFetch: (input: RequestInfo | URL, init?: RequestInit) => platformFetchMock(input, init),
    getDesktopStore: async () => null,
    getWebStorage: () => window.localStorage,
}));

describe("api/client", () => {
    beforeEach(() => {
        vi.resetModules();
        getSessionMock.mockReset();
        platformFetchMock.mockReset();
        tokenFetchMock.mockReset().mockResolvedValue(Response.json({ token: null }));
        vi.stubGlobal("fetch", tokenFetchMock);
        platformFetchMock.mockImplementation(async (_input, init) => Response.json({
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            cache: init?.cache ?? null,
            method: init?.method ?? "GET",
        }));
    });

    it("returns headers before consuming a JSON body and records only bounded diagnostics", async () => {
        const { apiClient, seedAuthJwtCache } = await import("../../../../app/lib/api/client");
        const { resetStartupTiming, collectStartupSamples } = await import("../../../../app/lib/startup-timing");
        resetStartupTiming();
        seedAuthJwtCache(jwt({ sub: "user", exp: liveExpiry }), "user");
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const response = new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } }), { status: 503 });
        platformFetchMock.mockResolvedValue(response);
        const result = await apiClient.api.tasks.$get({ query: {} });
        expect(result.bodyUsed).toBe(false);
        const body = result.json();
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "private content" } })));
        controller.close();
        await body;
        const samples = collectStartupSamples({ route: "capture", platform: "web", viewport: "wide", cache: "cold" });
        expect(samples.filter(s => s.phase === "api" || s.phase === "api_body").map(s => [s.phase, s.endpoint, s.status])).toEqual([["api", "tasks_open", 503], ["api_body", "tasks_open", 503]]);
        expect(samples.find(s => s.phase === "api_body")).toMatchObject({ outcome: "error", error_code: "INTERNAL_ERROR" });
        expect(JSON.stringify(samples)).not.toContain("private content");
    });

    const jwt = (payload: object) => `e30.${btoa(JSON.stringify(payload)).replaceAll("=", "")}.signature`;
    it("seeds only an unexpired JWT belonging to the resolved account", async () => {
        const { seedAuthJwtCache, authenticatedFetch } = await import("../../../../app/lib/api/client");
        for (const token of ["session-cookie", "x.invalid.y", jwt({ sub: "other", exp: liveExpiry }), jwt({ sub: "user", exp: Date.now() / 1000 + 2 }), jwt({ sub: "user" })]) {
            expect(seedAuthJwtCache(token, "user")).toBe(false);
        }
        const token = jwt({ sub: "user", exp: liveExpiry });
        expect(seedAuthJwtCache(token, "user")).toBe(true);
        const response = await authenticatedFetch("/api/tasks", { authenticated: true });
        expect(((await response.json()) as EchoedRequest).headers.authorization).toBe(`Bearer ${token}`);
        expect(tokenFetchMock).not.toHaveBeenCalled();
        expect(getSessionMock).not.toHaveBeenCalled();
    });
    it("retains a session seed when an earlier token request finishes", async () => {
        const pending = Promise.withResolvers<Response>();
        tokenFetchMock.mockReturnValueOnce(pending.promise);
        const { seedAuthJwtCache, authenticatedFetch } = await import("../../../../app/lib/api/client");
        const request = authenticatedFetch("/api/tasks", { authenticated: true });
        const token = jwt({ sub: "user", exp: liveExpiry });
        seedAuthJwtCache(token, "user");
        pending.resolve(Response.json({ token: jwt({ sub: "stale", exp: liveExpiry }) }));
        expect(((await (await request).json()) as EchoedRequest).headers.authorization).toBe(`Bearer ${token}`);
    });
    it("composes a GET deadline with caller cancellation", async () => {
        const { authenticatedFetch, seedAuthJwtCache } = await import("../../../../app/lib/api/client");
        seedAuthJwtCache(jwt({ sub: "user", exp: liveExpiry }), "user");
        const controller = new AbortController();
        await authenticatedFetch("/api/tasks", { authenticated: true, signal: controller.signal });
        const signal = platformFetchMock.mock.calls[0][1].signal;
        expect(signal).not.toBe(controller.signal);
        controller.abort();
        expect(signal.aborted).toBe(true);
    });
    it("preserves the assistant stream's caller-owned signal", async () => {
        const { authenticatedFetch, seedAuthJwtCache } = await import("../../../../app/lib/api/client");
        seedAuthJwtCache(jwt({ sub: "user", exp: liveExpiry }), "user");
        const controller = new AbortController();
        await authenticatedFetch("/api/v1/ai/chat", { authenticated: true, method: "POST", signal: controller.signal });
        expect(platformFetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    });

    it("shares token acquisition across concurrent requests and skips session reads on cache hits", async () => {
        tokenFetchMock.mockImplementation(async () => Response.json({ token: jwt({ sub: "user", exp: liveExpiry }) }));
        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        await Promise.all(["tasks", "projects", "settings"].map((path) =>
            authenticatedFetch(`/api/${path}`, { authenticated: true }),
        ));
        await authenticatedFetch("/api/tags", { authenticated: true });
        expect(tokenFetchMock).toHaveBeenCalledTimes(1);
        expect(getSessionMock).not.toHaveBeenCalled();
        expect(platformFetchMock).toHaveBeenCalledTimes(4);
    });

    it("does not reuse a token that arrives after sign-out or account invalidation", async () => {
        const token = Promise.withResolvers<Response>();
        tokenFetchMock.mockReturnValueOnce(token.promise);
        getSessionMock.mockResolvedValue({ data: null });
        const { authenticatedFetch, clearAuthJwtCache } = await import("../../../../app/lib/api/client");
        const oldRequest = authenticatedFetch("/api/tasks", { authenticated: true });
        clearAuthJwtCache();
        token.resolve(Response.json({ token: jwt({ sub: "old", exp: liveExpiry }) }));
        await expect(oldRequest).rejects.toMatchObject({ name: "AbortError" });
        expect(platformFetchMock).not.toHaveBeenCalled();
        tokenFetchMock.mockResolvedValueOnce(Response.json({ token: jwt({ sub: "new", exp: liveExpiry }) }));
        await authenticatedFetch("/api/tasks", { authenticated: true });
        expect(new Headers(platformFetchMock.mock.calls[0][1].headers).get("Authorization")).toBe(`Bearer ${jwt({ sub: "new", exp: liveExpiry })}`);
    });

    it("injects bearer tokens and disables GET caching for authenticated requests", async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { token: jwt({ sub: "user", exp: liveExpiry }) } },
        });

        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        const response = await authenticatedFetch("/api/tasks", { authenticated: true });
        const body = await response.json() as EchoedRequest;

        expect(body.headers.authorization).toBe(`Bearer ${jwt({ sub: "user", exp: liveExpiry })}`);
        expect(body.cache).toBe("no-store");
        expect(body.method).toBe("GET");
    });

    it("preserves non-GET cache semantics while still attaching auth", async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { token: jwt({ sub: "user", exp: liveExpiry }) } },
        });

        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        const response = await authenticatedFetch("/api/tasks", {
            authenticated: true,
            method: "POST",
            body: JSON.stringify({ title: "Create" }),
        });
        const body = await response.json() as EchoedRequest;

        expect(body.headers.authorization).toBe(`Bearer ${jwt({ sub: "user", exp: liveExpiry })}`);
        expect(body.cache).toBeNull();
        expect(body.method).toBe("POST");
    });

    it("reports no connection as a network error, never as signed out", async () => {
        tokenFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
        const { authenticatedFetch, clearAuthJwtCache } = await import("../../../../app/lib/api/client");
        await expect(authenticatedFetch("/api/tasks", { authenticated: true }))
            .rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE", isAuthError: false });

        clearAuthJwtCache();
        tokenFetchMock.mockResolvedValue(Response.json({ token: jwt({ sub: "a", exp: liveExpiry }) }));
        platformFetchMock.mockRejectedValueOnce(new TypeError("Load failed"));
        await expect(authenticatedFetch("/api/tasks", { authenticated: true })).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });

        // A captive portal answers with its own page.
        platformFetchMock.mockResolvedValueOnce(new Response("<html>", { headers: { "content-type": "text/html" } }));
        await expect(authenticatedFetch("/api/tasks", { authenticated: true })).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });

        // ...including to the token request, which must not read as signed out.
        clearAuthJwtCache();
        tokenFetchMock.mockResolvedValueOnce(new Response("<html>", { headers: { "content-type": "text/html" } }));
        await expect(authenticatedFetch("/api/tasks", { authenticated: true })).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
        expect(getSessionMock).not.toHaveBeenCalled();
    });

    it("throws a typed auth error when no token is available", async () => {
        getSessionMock.mockResolvedValue({ data: null });

        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        const { ApiErrorResponse } = await import("../../../../app/types/api");

        await expect(
            authenticatedFetch("/api/tasks", { authenticated: true }),
        ).rejects.toBeInstanceOf(ApiErrorResponse);
        await expect(
            authenticatedFetch("/api/tasks", { authenticated: true }),
        ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    });
    it("cancels promptly during shared token acquisition without cancelling another caller", async () => {
        const pending = Promise.withResolvers<Response>();
        tokenFetchMock.mockReturnValueOnce(pending.promise);
        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        const controller = new AbortController();
        const cancelled = authenticatedFetch("/api/tasks", { authenticated: true, signal: controller.signal });
        const remaining = authenticatedFetch("/api/projects", { authenticated: true });
        controller.abort();
        await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
        expect(platformFetchMock).not.toHaveBeenCalled();
        pending.resolve(Response.json({ token: jwt({ sub: "shared", exp: liveExpiry }) }));
        await remaining;
        expect(platformFetchMock).toHaveBeenCalledTimes(1);
        expect(tokenFetchMock).toHaveBeenCalledTimes(1);
    });



    it("refreshes a rejected assistant POST once with its body and idempotency key intact", async () => {
        const { authenticatedFetch, seedAuthJwtCache } = await import("../../../../app/lib/api/client");
        seedAuthJwtCache(jwt({ sub: "user", exp: Date.now() / 1000 + 60 }), "user");
        const fresh = jwt({ sub: "user", exp: Date.now() / 1000 + 120 });
        tokenFetchMock.mockResolvedValue(Response.json({ token: fresh }));
        platformFetchMock.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response("ok"));
        const body = JSON.stringify({ message: "Help me plan" });
        const response = await authenticatedFetch("/api/v1/ai/chat", {
            authenticated: true, method: "POST", body, headers: { "Idempotency-Key": "message-1" },
        });
        expect(response.status).toBe(200);
        expect(platformFetchMock).toHaveBeenCalledTimes(2);
        const retried = platformFetchMock.mock.calls[1][1];
        expect(retried.body).toBe(body);
        expect(new Headers(retried.headers).get("Idempotency-Key")).toBe("message-1");
        expect(new Headers(retried.headers).get("Authorization")).toBe(`Bearer ${fresh}`);
    });

    it("shares a fresh token across concurrent 401s", async () => {
        const { authenticatedFetch, seedAuthJwtCache } = await import("../../../../app/lib/api/client");
        const old = jwt({ sub: "user", exp: Date.now() / 1000 + 60 });
        seedAuthJwtCache(old, "user");
        const fresh = jwt({ sub: "user", exp: Date.now() / 1000 + 120 });
        tokenFetchMock.mockImplementation(async () => Response.json({ token: fresh }));
        platformFetchMock.mockImplementation(async (_input, init) => new Response(null, {
            status: new Headers(init.headers).get("Authorization") === `Bearer ${old}` ? 401 : 200,
        }));
        const responses = await Promise.all(["tasks", "ai/chat", "settings"].map(path => authenticatedFetch(`/api/${path}`, { authenticated: true })));
        expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
        expect(tokenFetchMock).toHaveBeenCalledTimes(1);
    });

    it("announces terminal expiry even for requests outside TanStack Query", async () => {
        const { authenticatedFetch, seedAuthJwtCache } = await import("../../../../app/lib/api/client");
        const { subscribeSessionExpiry } = await import("../../../../app/lib/auth/session");
        const expired = vi.fn();
        const unsubscribe = subscribeSessionExpiry(expired);
        seedAuthJwtCache(jwt({ sub: "user", exp: Date.now() / 1000 + 60 }), "user");
        tokenFetchMock.mockResolvedValue(Response.json({ token: jwt({ sub: "user", exp: Date.now() / 1000 + 120 }) }));
        platformFetchMock.mockImplementation(async () => new Response(null, { status: 401 }));
        expect((await authenticatedFetch("/api/v1/ai/chat", { authenticated: true })).status).toBe(401);
        expect(expired).toHaveBeenCalledOnce();
        expect(platformFetchMock).toHaveBeenCalledTimes(2);
        unsubscribe();
    });

    it("never sends an expired persisted JWT and forces a real session check", async () => {
        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        const { subscribeSessionExpiry } = await import("../../../../app/lib/auth/session");
        const expired = vi.fn();
        const unsubscribe = subscribeSessionExpiry(expired);
        getSessionMock.mockResolvedValue({ data: null });
        localStorage.setItem("desktop_oauth_session", JSON.stringify({
            jwt: jwt({ sub: "user", exp: Date.now() / 1000 - 60 }),
            data: { user: { id: "user" }, session: {} }, persistedAt: Date.now() - 120_000,
        }));
        await expect(authenticatedFetch("/api/tasks", { authenticated: true })).rejects.toMatchObject({ status: 401 });
        expect(platformFetchMock).not.toHaveBeenCalled();
        expect(getSessionMock).toHaveBeenCalledWith({ fetchOptions: { headers: { "X-Force-Fetch": "true" }, cache: "no-store" } });
        expect(expired).toHaveBeenCalledOnce();
        unsubscribe();
    });

    it("replays a Request body after a 401 without consuming the original", async () => {
        const { authenticatedFetch, seedAuthJwtCache } = await import("../../../../app/lib/api/client");
        seedAuthJwtCache(jwt({ sub: "user", exp: Date.now() / 1000 + 60 }), "user");
        tokenFetchMock.mockResolvedValue(Response.json({ token: jwt({ sub: "user", exp: Date.now() / 1000 + 120 }) }));
        const bodies: string[] = [];
        platformFetchMock.mockImplementation(async (input: Request) => {
            bodies.push(await input.text());
            return new Response(null, { status: bodies.length === 1 ? 401 : 200 });
        });
        const request = new Request("https://api.example.test/api/tasks", { method: "POST", body: "saved draft" });
        expect((await authenticatedFetch(request, { authenticated: true })).status).toBe(200);
        expect(bodies).toEqual(["saved draft", "saved draft"]);
        expect(request.bodyUsed).toBe(false);
    });

    it("does not expire a new account when an old request returns 401", async () => {
        const { authenticatedFetch, seedAuthJwtCache, clearAuthJwtCache } = await import("../../../../app/lib/api/client");
        const { subscribeSessionExpiry } = await import("../../../../app/lib/auth/session");
        const expired = vi.fn();
        const unsubscribe = subscribeSessionExpiry(expired);
        seedAuthJwtCache(jwt({ sub: "old", exp: Date.now() / 1000 + 60 }), "old");
        const pending = Promise.withResolvers<Response>();
        platformFetchMock.mockReturnValueOnce(pending.promise);
        const request = authenticatedFetch("/api/tasks", { authenticated: true });
        await vi.waitFor(() => expect(platformFetchMock).toHaveBeenCalledOnce());
        clearAuthJwtCache();
        seedAuthJwtCache(jwt({ sub: "new", exp: Date.now() / 1000 + 60 }), "new");
        pending.resolve(new Response(null, { status: 401 }));
        await request;
        expect(expired).not.toHaveBeenCalled();
        expect(tokenFetchMock).not.toHaveBeenCalled();
        unsubscribe();
    });

    it("preserves sign-in during a token refresh outage", async () => {
        const { authenticatedFetch, seedAuthJwtCache } = await import("../../../../app/lib/api/client");
        const { subscribeSessionExpiry } = await import("../../../../app/lib/auth/session");
        const expired = vi.fn();
        const unsubscribe = subscribeSessionExpiry(expired);
        seedAuthJwtCache(jwt({ sub: "user", exp: Date.now() / 1000 + 60 }), "user");
        platformFetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
        tokenFetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
        await expect(authenticatedFetch("/api/tasks", { authenticated: true })).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
        expect(expired).not.toHaveBeenCalled();
        unsubscribe();
    });

    it("holds API calls during a warm start until the real session seeds its JWT", async () => {
        const { holdForSession, releaseSessionHold, seedAuthJwtCache, authenticatedFetch, isSessionHeld } = await import("../../../../app/lib/api/client");
        holdForSession();
        expect(isSessionHeld()).toBe(true);
        const request = authenticatedFetch("/api/tasks", { authenticated: true });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(platformFetchMock).not.toHaveBeenCalled();
        const token = jwt({ sub: "user", exp: liveExpiry });
        seedAuthJwtCache(token, "user");
        releaseSessionHold();
        const body = await (await request).json() as EchoedRequest;
        expect(body.headers.authorization).toBe(`Bearer ${token}`);
        expect(tokenFetchMock).not.toHaveBeenCalled();
        expect(isSessionHeld()).toBe(false);
    });
    it("aborts held calls when the session check answers with another account", async () => {
        const { holdForSession, releaseSessionHold, clearAuthJwtCache, authenticatedFetch } = await import("../../../../app/lib/api/client");
        holdForSession();
        const request = authenticatedFetch("/api/tasks", { authenticated: true });
        clearAuthJwtCache();
        releaseSessionHold();
        await expect(request).rejects.toMatchObject({ name: "AbortError" });
        expect(platformFetchMock).not.toHaveBeenCalled();
    });
});
