import { afterEach, describe, expect, it, vi } from "vitest";
import { RESUME_FOR_MS, RESUME_ROUTE_KEY, RESUME_ROUTE_SCRIPT, forgetRoute, rememberRoute } from "../../../app/lib/resume-route";

const installed = (standalone: boolean) => vi.stubGlobal("matchMedia", (query: string) => ({ matches: standalone && query.includes("standalone") }));

/** Loads the page at `path` and runs the head script, as a launch would. */
const launch = (path: string) => {
    window.history.replaceState(null, "", path);
    new Function(RESUME_ROUTE_SCRIPT)();
    return window.location.pathname + window.location.search;
};

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
});

describe("resume route", () => {
    it("reopens the installed app on the screen it was left on", () => {
        installed(true);
        rememberRoute("/project/abc-123");
        expect(launch("/")).toBe("/project/abc-123");
    });

    it("opens Capture once the screen is stale, or when the last screen was Capture or not a workspace screen", () => {
        installed(true);
        rememberRoute("/schedule", Date.now() - RESUME_FOR_MS - 1);
        expect(launch("/")).toBe("/");
        rememberRoute("/schedule");
        rememberRoute("/");
        expect(localStorage.getItem(RESUME_ROUTE_KEY)).toBeNull();
        for (const path of ["/auth/sign-in", "/connect", "/desktop/quick-capture", "/habits"]) {
            rememberRoute(path);
            expect(launch("/")).toBe("/");
        }
        rememberRoute("/today");
        forgetRoute();
        expect(launch("/")).toBe("/");
    });

    it("never moves a tab, a link, or a launch with a query", () => {
        installed(false);
        rememberRoute("/routines");
        expect(launch("/")).toBe("/");
        installed(true);
        expect(launch("/?notifications=true")).toBe("/?notifications=true");
        expect(launch("/today")).toBe("/today");
    });

    it("ignores a saved value it didn't write", () => {
        installed(true);
        for (const saved of ["{", JSON.stringify({ path: "//evil.example", at: Date.now() }), JSON.stringify({ path: "/today/../connect", at: Date.now() })]) {
            localStorage.setItem(RESUME_ROUTE_KEY, saved);
            expect(launch("/")).toBe("/");
        }
    });
});
