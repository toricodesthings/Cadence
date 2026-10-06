import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDefaultDueDate } from "../../../../app/lib/utils/task/task-defaults";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

describe("resolveDefaultDueDate", () => {
    beforeEach(() => {
        // 2026-10-05 is a Monday; it is 22:00 in Toronto but already Tuesday in Kiritimati.
        vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date("2026-10-06T02:00:00.000Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("resolves presets to LocalDates in the user's zone", () => {
        setUserZone("America/Toronto");
        expect(resolveDefaultDueDate("Today")).toBe("2026-10-05");
        expect(resolveDefaultDueDate("Tomorrow")).toBe("2026-10-06");
        expect(resolveDefaultDueDate("Next Week")).toBe("2026-10-12");
        expect(resolveDefaultDueDate("None")).toBeUndefined();
        setUserZone("Pacific/Kiritimati");
        expect(resolveDefaultDueDate("Today")).toBe("2026-10-06");
        expect(resolveDefaultDueDate("Next Week")).toBe("2026-10-12");
    });
});
