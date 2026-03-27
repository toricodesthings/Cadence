import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const platformFetchMock = vi.fn();

vi.mock("../../../../app/lib/auth-client", () => ({
    authClient: {
        getSession: getSessionMock,
    },
}));

vi.mock("../../../../app/platform/runtime", () => ({
    IS_DESKTOP_RUNTIME: false,
    platformFetch: (input: RequestInfo | URL, init?: RequestInit) => platformFetchMock(input, init),
}));

describe("api/client", () => {
    beforeEach(() => {
        vi.resetModules();
        getSessionMock.mockReset();
        platformFetchMock.mockReset();
        platformFetchMock.mockImplementation(async (_input, init) => new Response(JSON.stringify({
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            cache: init?.cache ?? null,
            method: init?.method ?? "GET",
        })));
    });

    it("injects bearer tokens and disables GET caching for authenticated requests", async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { token: "header.payload.signature" } },
        });

        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        const response = await authenticatedFetch("/api/tasks", { authenticated: true });
        const body = await response.json() as {
            headers: Record<string, string>;
            cache: string | null;
            method: string;
        };

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
        const body = await response.json() as {
            headers: Record<string, string>;
            cache: string | null;
            method: string;
        };

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
