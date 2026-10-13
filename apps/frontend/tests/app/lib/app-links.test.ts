import { describe, expect, it } from "vitest";
import { APP_LINK_IDS } from "@cadence/contracts/app-link";
import { APP_CATALOG, appEntry } from "../../../app/lib/app-links/catalog";
import { createAppSearch, pickerSections, suggestForTitle } from "../../../app/lib/app-links/picker";
import { resolveAppLaunch } from "../../../app/platform/app-links";

const ids = (sections: ReturnType<typeof pickerSections>) => sections.flatMap((section) => section.apps.map((app) => app.id));

describe("catalogue", () => {
    it("has one entry per contract id, with fixed initials and no URL carrying identity", () => {
        expect(APP_CATALOG.map((entry) => entry.id).sort()).toEqual([...APP_LINK_IDS].sort());
        for (const entry of APP_CATALOG) {
            expect(entry.initials.length).toBeGreaterThan(0);
            for (const route of Object.values(entry.routes)) expect(route.href).toMatch(/^(https:\/\/|mfp:\/\/)/);
        }
    });

    it("only MyFitnessPal's iPhone route is verified", () => {
        const verified = APP_CATALOG.flatMap((entry) => Object.entries(entry.routes).filter(([, route]) => route.verified).map(([platform]) => `${entry.id}:${platform}`));
        expect(verified).toEqual(["myfitnesspal:ios"]);
    });

    it("an unknown id has no entry", () => expect(appEntry("future-app")).toBeUndefined());
});

describe("picker order", () => {
    it("lists the current choice first, suggestions next, the rest A→Z, each app once", () => {
        const suggested = suggestForTitle("Check emails", APP_CATALOG);
        const sections = pickerSections(APP_CATALOG, "spotify", suggested, "routine");
        expect(sections.map((section) => section.heading)).toEqual([undefined, "For email", "Other apps"]);
        expect(sections[0].apps.map((app) => app.id)).toEqual(["spotify"]);
        expect(sections[1].apps.map((app) => app.id)).toEqual(["gmail", "outlook"]);
        expect(ids(sections)).toHaveLength(APP_CATALOG.length);
        expect(new Set(ids(sections)).size).toBe(APP_CATALOG.length);
    });

    it("a named app is under the item, not a category", () => {
        const sections = pickerSections(APP_CATALOG, null, suggestForTitle("Check Gmail", APP_CATALOG), "task");
        expect(sections[0]).toMatchObject({ heading: "For this task" });
        expect(sections[0].apps.map((app) => app.id)).toEqual(["gmail"]);
    });

    it("no suggestion: one alphabetical list with no heading", () => {
        const sections = pickerSections(APP_CATALOG, null, suggestForTitle("Morning routine", APP_CATALOG), "routine");
        expect(sections).toHaveLength(1);
        expect(sections[0].heading).toBeUndefined();
        expect(ids(sections)).toEqual([...APP_CATALOG].map((entry) => entry.label).sort((a, b) => a.localeCompare(b)).map((label) => APP_CATALOG.find((entry) => entry.label === label)!.id));
    });
});

describe("picker search", () => {
    const search = createAppSearch(APP_CATALOG);
    const hits = (query: string) => search(query).map((entry) => entry.id);

    it.each([
        ["gmail", "gmail"],
        ["gma", "gmail"],
        ["google mail", "gmail"],
        ["mfp", "myfitnesspal"],
        ["calories", "myfitnesspal"],
        ["log food", "myfitnesspal"],
    ])("%s finds %s first", (query, first) => expect(hits(query)[0]).toBe(first));

    it("email and inbox find both email apps", () => {
        expect(hits("email")).toEqual(expect.arrayContaining(["gmail", "outlook"]));
        expect(hits("inbox")).toEqual(expect.arrayContaining(["gmail", "outlook"]));
    });

    it("an unsupported name finds nothing, and never a near miss", () => {
        expect(hits("apple mail")).toEqual([]);
        expect(hits("zz")).toEqual([]);
    });

    it("one or two letters match name prefixes only", () => {
        expect(hits("sp")).toEqual(["spotify"]);
        expect(hits("e")).not.toContain("gmail"); // "e" is in its terms ("email") but not a name prefix
    });

    it("a blank query returns nothing (the ordered list shows instead)", () => expect(hits("  ")).toEqual([]));
});

describe("launch resolution", () => {
    it("never puts a title or identity in a destination", () => {
        for (const entry of APP_CATALOG) {
            for (const route of Object.values(entry.routes)) expect(route.href).not.toMatch(/[?&](q|query|title|text|subject|to|email)=/);
        }
    });

    it("a website route says it opens a website", () => {
        const gmail = resolveAppLaunch(appEntry("gmail")!);
        expect(gmail).toMatchObject({ href: "https://mail.google.com/", opens: "website", website: null });
    });
});
