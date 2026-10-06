import { describe, expect, it, vi } from "vitest";
import { SESSION_PREFETCH_SCRIPT, takePrefetchedSession } from "../../../../app/lib/auth/session-prefetch";

const run = (path: string) => {
    window.history.replaceState(null, "", path);
    new Function(SESSION_PREFETCH_SCRIPT)();
};

describe("session prefetch head script", () => {
    it("starts get-session on workspace paths and carries the JWT the SDK would read", async () => {
        const fetch = vi.fn().mockResolvedValue(Response.json({ user: { id: "user-1" }, session: { token: "opaque" } }, { headers: { "set-auth-jwt": "a.b.c" } }));
        vi.stubGlobal("fetch", fetch);
        run("/project/abc");
        expect(fetch).toHaveBeenCalledWith("/api/auth/get-session", { credentials: "include", cache: "no-store" });
        expect(await takePrefetchedSession()).toEqual({ user: { id: "user-1" }, session: { token: "a.b.c" } });
        expect(takePrefetchedSession()).toBeNull();
    });

    it("answers null for no session or a failed request", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(null)));
        run("/");
        expect(await takePrefetchedSession()).toBeNull();
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
        run("/today");
        expect(await takePrefetchedSession()).toBeNull();
    });

    it("stays off auth, consent and other pages", () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        for (const path of ["/auth/sign-in", "/connect", "/help-feedback", "/projects"]) run(path);
        expect(fetch).not.toHaveBeenCalled();
        expect(takePrefetchedSession()).toBeNull();
    });
});
