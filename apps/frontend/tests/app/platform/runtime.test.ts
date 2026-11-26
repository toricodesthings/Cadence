import { afterEach, describe, expect, it, vi } from "vitest";

const JOIN = "/join/AAAA";
const load = async (target: "web" | "desktop") => {
    vi.resetModules();
    vi.doMock("../../../app/lib/env", async (importOriginal) => ({
        ...(await importOriginal<typeof import("../../../app/lib/env")>()),
        RUNTIME_TARGET: target,
    }));
    return import("../../../app/platform/runtime");
};

afterEach(() => vi.doUnmock("../../../app/lib/env"));

describe("auth callback URLs", () => {
    it("web: a Google/GitHub sign-up comes back to /auth/callback with the join link", async () => {
        const { getAuthCallbackUrl } = await load("web");
        const url = new URL(getAuthCallbackUrl(JOIN));
        expect(url.pathname).toBe("/auth/callback");
        expect(url.searchParams.get("redirectTo")).toBe(JOIN);
    });

    it("desktop: the cadence:// callback carries the join link, and the callback screen reads it back", async () => {
        const { getAuthCallbackUrl, mergedCallbackParams } = await load("desktop");
        const callback = getAuthCallbackUrl(JOIN);
        expect(callback).toBe(`cadence://auth/callback?redirectTo=${encodeURIComponent(JOIN)}`);
        expect(new URL(callback).searchParams.get("redirectTo")).toBe(JOIN);
        const { search, hash } = new URL(`${callback}&desktop_auth_state=s#redirectTo=%2Felsewhere`);
        expect(mergedCallbackParams({ search, hash }).get("redirectTo")).toBe(JOIN);
    });
});

describe("normalizeRedirectTo", () => {
    it("keeps a join link and refuses anything off-site", async () => {
        const { normalizeRedirectTo } = await load("web");
        expect(normalizeRedirectTo(JOIN)).toBe(JOIN);
        for (const bad of ["//evil.example/join/x", "https://evil.example/", "javascript:alert(1)", "/\\evil.example"])
            expect(normalizeRedirectTo(bad)).not.toMatch(/evil|javascript/);
    });
});
