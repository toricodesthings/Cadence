import { describe, expect, it } from "vitest";
import { settingsPatchSchema } from "../../src/types/settings";

describe("settings patch schema", () => {
    it("accepts nested partial updates used by the frontend", () => {
        expect(
            settingsPatchSchema.parse({
                tasks: { hideCompleted: true },
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
            tasks: { hideCompleted: true },
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
});
