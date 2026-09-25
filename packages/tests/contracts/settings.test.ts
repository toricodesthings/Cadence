import { describe, expect, it } from "vitest";
import {
    backgroundUploadMetaSchema,
    deepMerge,
    focusViewDefinitionSchema,
    savedFocusViewInputSchema,
    SETTINGS_DEFAULTS,
    settingsPatchSchema,
    userSettingsSchema,
} from "@cadence/contracts/settings";

describe("SETTINGS_DEFAULTS", () => {
    it("satisfies the canonical settings schema exactly", () => {
        expect(userSettingsSchema.parse(SETTINGS_DEFAULTS)).toEqual(SETTINGS_DEFAULTS);
    });
});

describe("settingsPatchSchema", () => {
    it("accepts nested partial updates at any depth", () => {
        const patch = {
            tasks: { hideCompleted: true, intelligence: { lowStimulationMode: true, dismissedEntityIds: ["project:1"] } },
            dateTime: { timezone: "America/Toronto" },
            calendar: { holidays: { enabled: false } },
            location: { countryCode: "CA", promptDismissedAt: "2026-03-11T15:00:00.000Z" },
            weather: { enabled: false },
            appearance: { backgroundImage: { accent: "#e8a44a", blur: 40 } },
            preferredView: "kanban",
        };

        expect(settingsPatchSchema.parse(patch)).toEqual(patch);
    });

    it("strips the retired holiday location fields", () => {
        expect(
            settingsPatchSchema.parse({ calendar: { holidays: { enabled: true, usePreciseLocation: true, locationMode: "manual" } } }),
        ).toEqual({ calendar: { holidays: { enabled: true } } });
    });

    it.each([
        [{ notifications: { email: "yes" } }, "a wrong nested type"],
        [{ location: { mode: "gps" } }, "an unknown location mode"],
        [{ appearance: { theme: "neon" } }, "an unknown theme"],
        [{ appearance: { backgroundImage: { blur: 101 } } }, "blur over 100"],
    ])("rejects %j (%s)", (patch, _reason) => {
        expect(settingsPatchSchema.safeParse(patch).success).toBe(false);
    });
});

describe("deepMerge", () => {
    it("merges objects key by key and replaces arrays and scalars", () => {
        const target = { a: { b: 1, c: 2 }, list: [1, 2, 3], n: 1 };
        const source = { a: { c: 9 }, list: [4], n: 2 };

        expect(deepMerge(target, source)).toEqual({ a: { b: 1, c: 9 }, list: [4], n: 2 });
    });

    it("replaces a null default with an object (e.g. a stored background photo)", () => {
        expect(deepMerge({ image: null }, { image: { id: "x" } })).toEqual({ image: { id: "x" } });
    });

    it("does not mutate its inputs", () => {
        const target = { a: { b: 1 } };
        deepMerge(target, { a: { b: 2 } });
        expect(target).toEqual({ a: { b: 1 } });
    });

    it("ignores prototype-polluting keys", () => {
        const merged = deepMerge({}, JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}}'));

        expect(({} as any).polluted).toBeUndefined();
        expect(Object.keys(merged)).toEqual([]);
    });
});

describe("saved focus views", () => {
    const definition = {
        states: ["ACTIVE"],
        needsDate: false,
        needsProject: false,
        priorityMin: null,
        effortMax: 1,
        dueWindow: null,
        waitingOnly: false,
        missingStructureOnly: false,
        sortMode: "smart",
    };

    it("defaults project and tag filters to empty", () => {
        expect(focusViewDefinitionSchema.parse(definition)).toMatchObject({ projectIds: [], tagIds: [] });
    });

    it("requires at least one task state", () => {
        expect(focusViewDefinitionSchema.safeParse({ ...definition, states: [] }).success).toBe(false);
    });

    it("accepts a named, pinned view", () => {
        expect(savedFocusViewInputSchema.parse({ name: "Quick Wins", definition, isPinned: true, source: "manual" })).toMatchObject({
            name: "Quick Wins",
            isPinned: true,
            source: "manual",
        });
    });
});

describe("backgroundUploadMetaSchema", () => {
    it("splits the comma-separated swatch list", () => {
        expect(backgroundUploadMetaSchema.parse({ dominant: "#1a2233", swatches: "#e8a44a,#7eb8d4" })).toEqual({
            dominant: "#1a2233",
            swatches: ["#e8a44a", "#7eb8d4"],
        });
    });

    it.each([
        [{ dominant: "#1a2233", swatches: "red,blue" }, "named colours"],
        [{ dominant: "#1a2233", swatches: Array(7).fill("#000000").join(",") }, "more than 6 swatches"],
        [{ dominant: "1a2233", swatches: "#000000" }, "a dominant without #"],
    ])("rejects %j (%s)", (meta, _reason) => {
        expect(backgroundUploadMetaSchema.safeParse(meta).success).toBe(false);
    });
});
