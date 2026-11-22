import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMinDesktopVersion, isVersionBelow } from "../../../app/platform/desktop-update-state";

describe("isVersionBelow", () => {
    it("compares major, minor, and patch numbers", () => {
        expect(isVersionBelow("2.0.9", "2.1.0")).toBe(true);
        expect(isVersionBelow("1.9.9", "2.1.0")).toBe(true);
        expect(isVersionBelow("2.1.0", "2.1.1")).toBe(true);
        expect(isVersionBelow("2.1.0", "2.1.0")).toBe(false);
        expect(isVersionBelow("2.1.1", "2.1.0")).toBe(false);
        expect(isVersionBelow("3.0.0", "2.1.0")).toBe(false);
    });

    it("handles leading v prefix and prerelease suffixes", () => {
        expect(isVersionBelow("v2.0.2", "v2.1.0")).toBe(true);
        expect(isVersionBelow("2.1.0-beta.1", "2.1.0")).toBe(true);
        expect(isVersionBelow("2.1.0", "2.1.0-beta.1")).toBe(false);
    });

    it("fails open for invalid or empty version strings", () => {
        expect(isVersionBelow("", "2.1.0")).toBe(false);
        expect(isVersionBelow("2.0.0", "")).toBe(false);
        expect(isVersionBelow("not-a-version", "2.1.0")).toBe(false);
        expect(isVersionBelow("2.0.0", "latest")).toBe(false);
    });
});

describe("fetchMinDesktopVersion", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns trimmed minDesktopVersion from /health", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ data: { status: "ok", minDesktopVersion: " 2.1.0 " } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            ),
        );

        await expect(fetchMinDesktopVersion()).resolves.toBe("2.1.0");
    });

    it("returns null when offline, non-200, or unset", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
        await expect(fetchMinDesktopVersion()).resolves.toBeNull();

        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
        await expect(fetchMinDesktopVersion()).resolves.toBeNull();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ data: { status: "ok", minDesktopVersion: null } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            ),
        );
        await expect(fetchMinDesktopVersion()).resolves.toBeNull();
    });
});
