import { afterEach, describe, expect, it } from "vitest";
import { GREETINGS, getTimeBasedGreeting } from "../../../../app/lib/constants/greetings";
import { deviceZone, setUserZone } from "../../../../app/lib/utils/user-zone";

const withName = (lines: readonly (readonly [string, string])[]) =>
    lines.map(([named]) => named.replace("{name}", "Tori"));

describe("getTimeBasedGreeting", () => {
    afterEach(() => setUserZone(deviceZone()));

    it("follows the part of the day in the user's zone and holds steady within it", () => {
        setUserZone("America/Toronto");
        const morning = getTimeBasedGreeting(new Date("2026-10-06T13:00:00Z"), "Tori");
        expect(getTimeBasedGreeting(new Date("2026-10-06T15:30:00Z"), "Tori")).toBe(morning);
        expect(withName(GREETINGS.morning)).toContain(morning);
        setUserZone("Asia/Tokyo");
        expect(withName(GREETINGS.night)).toContain(getTimeBasedGreeting(new Date("2026-10-06T13:00:00Z"), "Tori"));
    });

    it("changes from one day to the next", () => {
        setUserZone("America/Toronto");
        expect(getTimeBasedGreeting(new Date("2026-10-07T13:00:00Z"))).not.toBe(
            getTimeBasedGreeting(new Date("2026-10-06T13:00:00Z")),
        );
    });

    it("uses the nameless line when there's no name", () => {
        setUserZone("America/Toronto");
        const bare = getTimeBasedGreeting(new Date("2026-10-06T13:00:00Z"));
        expect(GREETINGS.morning.map(([, line]) => line)).toContain(bare);
    });
});
