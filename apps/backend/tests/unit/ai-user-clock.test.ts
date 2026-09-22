import { describe, expect, it } from "vitest";
import { userClock } from "../../src/domains/ai/agent";

describe("userClock (the time context the assistant gets)", () => {
    it("at 10:30 PM in Toronto, says it is still Monday the 21st, not the UTC date", () => {
        const clock = userClock("America/Toronto", "2026-09-22T02:30:00.000Z");

        expect(clock).toMatchObject({
            timezone: "America/Toronto",
            today: "2026-09-21",
            localTime: "2026-09-21T22:30:00-04:00 (Monday)",
        });
    });

    it("falls back to UTC for an unknown zone and to the server clock for a bad timestamp", () => {
        const clock = userClock("Not/AZone", "garbage");

        expect(clock.timezone).toBe("UTC");
        expect(Math.abs(clock.now.getTime() - Date.now())).toBeLessThan(5_000);
    });
});
