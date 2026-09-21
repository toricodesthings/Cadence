import { describe, expect, it } from "vitest";
import { routineTimeOn, suggestInteractionMode } from "./repeats";

describe("routineTimeOn", () => {
    const gym = { targetTime: "18:00", targetTimes: { SA: "", MO: "07:00" } };

    it("uses the weekday override, the usual time, or none", () => {
        expect(routineTimeOn(gym, "2026-09-21")).toBe("07:00"); // Monday
        expect(routineTimeOn(gym, "2026-09-22")).toBe("18:00"); // Tuesday
        expect(routineTimeOn(gym, "2026-09-26")).toBeNull(); // Saturday: any time
        expect(routineTimeOn({ targetTime: null }, "2026-09-21")).toBeNull();
    });
});

describe("suggestInteractionMode", () => {
    const series = {
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE",
        scheduledStart: "2026-09-21T10:00:00Z",
        scheduledEnd: "2026-09-21T11:00:00Z",
        isAllDay: false,
    };

    it("makes timed class-like series Fixed and leaves the rest as tasks", () => {
        expect(suggestInteractionMode({ ...series, title: "Chem 101 lecture" })).toBe("timetable");
        expect(suggestInteractionMode({ ...series, title: "Pay rent" })).toBe("task");
        expect(suggestInteractionMode({ ...series, title: "Class", scheduledEnd: null })).toBe("task");
        expect(suggestInteractionMode({ ...series, title: "Class", recurrenceRule: null })).toBe("task");
    });
});
