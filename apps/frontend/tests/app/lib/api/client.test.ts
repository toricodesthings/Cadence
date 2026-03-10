import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorResponse } from "../../../../app/types/api";

const getSessionMock = vi.fn();

vi.mock("../../../../app/lib/auth-client", () => ({
    authClient: {
        getSession: getSessionMock,
    },
}));

describe("api/client", () => {
    beforeEach(() => {
        getSessionMock.mockReset();
        vi.stubGlobal("fetch", vi.fn(async (_input, init) => new Response(JSON.stringify({
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            cache: init?.cache ?? null,
            method: init?.method ?? "GET",
        }))));
    });

    it("injects bearer tokens and disables GET caching for authenticated requests", async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { token: "jwt-123" } },
        });

        const { authenticatedFetch } = await import("../../../../app/lib/api/client");
        const response = await authenticatedFetch("/api/tasks", { authenticated: true });
        const body = await response.json() as {
            headers: Record<string, string>;
            cache: string | null;
            method: string;
        };

        expect(body.headers.authorization).toBe("Bearer jwt-123");
        expect(body.cache).toBe("no-store");
        expect(body.method).toBe("GET");
    });

    it("preserves non-GET cache semantics while still attaching auth", async () => {
        getSessionMock.mockResolvedValue({
            data: { session: { token: "jwt-456" } },
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

        expect(body.headers.authorization).toBe("Bearer jwt-456");
        expect(body.cache).toBeNull();
        expect(body.method).toBe("POST");
    });

    it("throws a typed auth error when no token is available", async () => {
        getSessionMock.mockResolvedValue({ data: null });

        const { authenticatedFetch } = await import("../../../../app/lib/api/client");

        await expect(
            authenticatedFetch("/api/tasks", { authenticated: true }),
        ).rejects.toBeInstanceOf(ApiErrorResponse);
        await expect(
            authenticatedFetch("/api/tasks", { authenticated: true }),
        ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    });
});
