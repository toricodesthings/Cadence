import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const platformFetchMock = vi.fn();
const tokenFetchMock = vi.fn();

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

    it("shares token acquisition across concurrent requests and skips session reads on cache hits", async () => {
        tokenFetchMock.mockImplementation(async () => Response.json({ token: "cached.jwt.signature" }));
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
        token.resolve(Response.json({ token: "old.jwt.signature" }));
        await expect(oldRequest).rejects.toMatchObject({ status: 401 });
        expect(platformFetchMock).not.toHaveBeenCalled();
        tokenFetchMock.mockResolvedValueOnce(Response.json({ token: "new.jwt.signature" }));
        await authenticatedFetch("/api/tasks", { authenticated: true });
        expect(new Headers(platformFetchMock.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer new.jwt.signature");
    });

    it("injects bearer tokens and disables GET caching for authenticated requests", async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { token: "header.payload.signature" } },
        });

        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        const response = await authenticatedFetch("/api/tasks", { authenticated: true });
        const body = await response.json() as EchoedRequest;

        expect(body.headers.authorization).toBe("Bearer header.payload.signature");
        expect(body.cache).toBe("no-store");
        expect(body.method).toBe("GET");
    });

    it("preserves non-GET cache semantics while still attaching auth", async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { token: "header.payload.signature" } },
        });

        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        const response = await authenticatedFetch("/api/tasks", {
            authenticated: true,
            method: "POST",
            body: JSON.stringify({ title: "Create" }),
        });
        const body = await response.json() as EchoedRequest;

        expect(body.headers.authorization).toBe("Bearer header.payload.signature");
        expect(body.cache).toBeNull();
        expect(body.method).toBe("POST");
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
});
