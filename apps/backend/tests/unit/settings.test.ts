import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../../src/domains/settings/settings.route";

// Schema, deepMerge, and legacy-location rules are tested in @cadence/contracts.
// This covers only what the backend adds on top when it reads stored settings.
describe("normalizeSettings", () => {
    it("moves legacy users to approximate location and fills every default", () => {
        const normalized = normalizeSettings({
            calendar: { holidays: { enabled: false, usePreciseLocation: false, locationMode: "auto" } },
        });

        expect(normalized.location).toEqual({ mode: "approximate", countryCode: null, subdivisionCode: null, city: null, promptDismissedAt: null });
        expect(normalized.weather).toEqual({ enabled: true });
        expect(normalized.calendar.holidays.enabled).toBe(false);
    });

    it("keeps a stored photo instead of merging it into the null default", () => {
        const image = { id: "22222222-2222-4222-8222-222222222222", dominant: "#1a2233", swatches: ["#e8a44a"], accent: null, blur: 20, brightness: 70 };

        const normalized = normalizeSettings({ appearance: { backgroundMode: "image", backgroundImage: image } });

        expect(normalized.appearance.backgroundImage).toEqual(image);
        expect(normalized.appearance.backgroundMode).toBe("image");
    });

    it("defaults to no photo and the theme background", () => {
        const normalized = normalizeSettings({});

        expect(normalized.appearance.backgroundImage).toBeNull();
        expect(normalized.appearance.backgroundMode).toBe("theme");
    });

    it("migrates legacy preferredView into tasks.defaultView", () => {
        expect(normalizeSettings({ preferredView: "kanban" }).tasks.defaultView).toBe("kanban");
    });

    it("never lets legacy preferredView override an explicit tasks.defaultView", () => {
        expect(normalizeSettings({ preferredView: "kanban", tasks: { defaultView: "list" } }).tasks.defaultView).toBe("list");
    });
});
