import { afterEach, describe, expect, it, vi } from "vitest";
import { isInstalledApp, syncAppBadge } from "../../../app/platform/installed-app";

afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { setAppBadge?: unknown }).setAppBadge;
    delete (navigator as { clearAppBadge?: unknown }).clearAppBadge;
});

describe("installed app", () => {
    it("counts iOS's fullscreen report as the installed app", () => {
        vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("fullscreen") }));
        expect(isInstalledApp()).toBe(true);
        vi.stubGlobal("matchMedia", () => ({ matches: false }));
        expect(isInstalledApp()).toBe(false);
    });

    it("shows the unread count on the icon and clears it at zero", async () => {
        const setAppBadge = vi.fn().mockResolvedValue(undefined);
        const clearAppBadge = vi.fn().mockRejectedValue(new Error("no permission"));
        Object.assign(navigator, { setAppBadge, clearAppBadge });
        await syncAppBadge(3);
        expect(setAppBadge).toHaveBeenCalledWith(3);
        await expect(syncAppBadge(0)).resolves.toBeUndefined();
        expect(clearAppBadge).toHaveBeenCalled();
    });
});
