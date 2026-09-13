import { describe, expect, it } from "vitest";
import {
    focusViewDefinitionSchema,
    migrateLegacySettings,
    savedFocusViewInputSchema,
    settingsPatchSchema,
} from "@cadence/contracts/settings";
import { normalizeSettings } from "../../src/domains/settings/settings.route";

describe("settings patch schema", () => {
    it("accepts nested partial updates used by the frontend", () => {
        expect(
            settingsPatchSchema.parse({
                tasks: {
                    hideCompleted: true,
                    intelligence: { lowStimulationMode: true, dismissedEntityIds: ["project:1"] },
                },
                dateTime: { timezone: "America/Toronto" },
                calendar: { holidays: { enabled: false } },
                location: { countryCode: "CA", promptDismissedAt: "2026-03-11T15:00:00.000Z" },
                weather: { enabled: false },
                preferredView: "kanban",
            }),
        ).toEqual({
            tasks: {
                hideCompleted: true,
                intelligence: { lowStimulationMode: true, dismissedEntityIds: ["project:1"] },
            },
            dateTime: { timezone: "America/Toronto" },
            calendar: { holidays: { enabled: false } },
            location: { countryCode: "CA", promptDismissedAt: "2026-03-11T15:00:00.000Z" },
            weather: { enabled: false },
            preferredView: "kanban",
        });
    });

    it("strips the retired holiday location fields from patches", () => {
        expect(
            settingsPatchSchema.parse({
                calendar: { holidays: { enabled: true, usePreciseLocation: true, locationMode: "manual" } },
            }),
        ).toEqual({ calendar: { holidays: { enabled: true } } });
    });

    it("rejects unknown location modes", () => {
        expect(() => settingsPatchSchema.parse({ location: { mode: "gps" } })).toThrow();
    });
});

describe("legacy location migration", () => {
    it("maps manual holiday settings to manual location", () => {
        const migrated = migrateLegacySettings({
            calendar: {
                holidays: {
                    enabled: true,
                    usePreciseLocation: false,
                    locationMode: "manual",
                    countryCode: "CA",
                    subdivisionCode: "CA-ON",
                    promptDismissedAt: null,
                },
            },
        }) as Record<string, any>;

        expect(migrated.location).toEqual({
            mode: "manual",
            countryCode: "CA",
            subdivisionCode: "CA-ON",
            city: null,
            promptDismissedAt: null,
        });
    });

    it("keeps precise location and a permanent dismissal", () => {
        const migrated = migrateLegacySettings({
            calendar: {
                holidays: {
                    enabled: true,
                    usePreciseLocation: true,
                    locationMode: "auto",
                    countryCode: null,
                    subdivisionCode: null,
                    promptDismissedAt: "2026-03-11T15:00:00.000Z",
                },
            },
        }) as Record<string, any>;

        expect(migrated.location.mode).toBe("precise");
        expect(migrated.location.promptDismissedAt).toBe("2026-03-11T15:00:00.000Z");
    });

    it("never overwrites an existing location section", () => {
        const stored = {
            location: { mode: "off" },
            calendar: { holidays: { enabled: true, usePreciseLocation: true, locationMode: "auto" } },
        };
        expect(migrateLegacySettings(stored)).toBe(stored);
    });

    it("normalizes legacy users to approximate with the defaults filled in", () => {
        const normalized = normalizeSettings({
            calendar: { holidays: { enabled: false, usePreciseLocation: false, locationMode: "auto" } },
        });

        expect(normalized.location).toEqual({
            mode: "approximate",
            countryCode: null,
            subdivisionCode: null,
            city: null,
            promptDismissedAt: null,
        });
        expect(normalized.weather).toEqual({ enabled: true });
        expect(normalized.calendar.holidays.enabled).toBe(false);
    });
});

describe("settings patch schema (validation)", () => {

    it("rejects invalid nested values", () => {
        expect(() =>
            settingsPatchSchema.parse({
                notifications: { email: "yes" },
            }),
        ).toThrow();
    });

    it("accepts saved focus view payloads", () => {
        expect(
            savedFocusViewInputSchema.parse({
                name: "Quick Wins",
                definition: focusViewDefinitionSchema.parse({
                    states: ["ACTIVE"],
                    projectIds: [],
                    tagIds: [],
                    needsDate: false,
                    needsProject: false,
                    priorityMin: null,
                    effortMax: 1,
                    dueWindow: null,
                    waitingOnly: false,
                    missingStructureOnly: false,
                    sortMode: "smart",
                }),
                isPinned: true,
                source: "manual",
            }),
        ).toMatchObject({
            name: "Quick Wins",
            isPinned: true,
            source: "manual",
        });
    });
});
