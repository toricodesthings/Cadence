import { describe, expect, it } from "vitest";
import { settingsPatchSchema } from "../../src/types/settings";

describe("settings patch schema", () => {
    it("accepts nested partial updates used by the frontend", () => {
        expect(
            settingsPatchSchema.parse({
                tasks: { hideCompleted: true },
                dateTime: { timezone: "America/Toronto" },
                preferredView: "kanban",
            }),
        ).toEqual({
            tasks: { hideCompleted: true },
            dateTime: { timezone: "America/Toronto" },
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
