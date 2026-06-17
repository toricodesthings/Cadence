import { describe, expect, it } from "vitest";
import { focusViewDefinitionSchema, savedFocusViewInputSchema, settingsPatchSchema } from "@cadence/contracts/settings";

describe("settings patch schema", () => {
    it("accepts nested partial updates used by the frontend", () => {
        expect(
            settingsPatchSchema.parse({
                tasks: {
                    hideCompleted: true,
                    intelligence: { lowStimulationMode: true, dismissedEntityIds: ["project:1"] },
                },
                dateTime: { timezone: "America/Toronto" },
                calendar: {
                    holidays: {
                        enabled: false,
                        countryCode: "CA",
                        promptDismissedAt: "2026-03-11T15:00:00.000Z",
                    },
                },
                preferredView: "kanban",
            }),
        ).toEqual({
            tasks: {
                hideCompleted: true,
                intelligence: { lowStimulationMode: true, dismissedEntityIds: ["project:1"] },
            },
            dateTime: { timezone: "America/Toronto" },
            calendar: {
                holidays: {
                    enabled: false,
                    countryCode: "CA",
                    promptDismissedAt: "2026-03-11T15:00:00.000Z",
                },
            },
            preferredView: "kanban",
        });
    });

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
