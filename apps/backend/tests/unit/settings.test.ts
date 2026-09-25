import { describe, expect, it } from "vitest";
import { migrateLegacySettings, normalizeSettings } from "../../src/domains/settings/settings.route";

// Schema and deepMerge rules are tested in @cadence/contracts.
// This covers what the backend adds on top when it reads stored settings.
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

describe("migrateLegacySettings", () => {
    const legacy = (holidays: Record<string, unknown>) => ({ calendar: { holidays } });

    it("lifts manual holiday location into settings.location", () => {
        const migrated = migrateLegacySettings(
            legacy({ enabled: true, usePreciseLocation: false, locationMode: "manual", countryCode: "CA", subdivisionCode: "CA-ON", promptDismissedAt: null }),
        ) as any;

        expect(migrated.location).toEqual({ mode: "manual", countryCode: "CA", subdivisionCode: "CA-ON", city: null, promptDismissedAt: null });
    });

    it.each([
        [{ locationMode: "auto", usePreciseLocation: true }, "precise"],
        [{ locationMode: "auto", usePreciseLocation: false }, "approximate"],
        [{ locationMode: "manual", usePreciseLocation: true }, "manual"],
    ])("maps %j to mode %s", (holidays, mode) => {
        expect((migrateLegacySettings(legacy(holidays)) as any).location.mode).toBe(mode);
    });

    it("keeps a permanent prompt dismissal", () => {
        const migrated = migrateLegacySettings(legacy({ usePreciseLocation: true, promptDismissedAt: "2026-03-11T15:00:00.000Z" })) as any;
        expect(migrated.location.promptDismissedAt).toBe("2026-03-11T15:00:00.000Z");
    });

    it("never overwrites an existing location section", () => {
        const stored = { location: { mode: "off" }, calendar: { holidays: { usePreciseLocation: true } } };
        expect(migrateLegacySettings(stored)).toBe(stored);
    });

    it("leaves the legacy keys in place for older clients", () => {
        const migrated = migrateLegacySettings(legacy({ locationMode: "manual", countryCode: "CA" })) as any;
        expect(migrated.calendar.holidays.countryCode).toBe("CA");
    });
});
