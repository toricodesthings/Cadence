import { describe, expect, it } from "vitest";
import { habitOccurrences, localDay, routineTimeOn, stepDayStatus, stepMarksOn, suggestInteractionMode } from "./repeats";

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

describe("habitOccurrences", () => {
    it("lists only the days a Mon/Wed routine is due", () => {
        const days = habitOccurrences(
            "FREQ=WEEKLY;BYDAY=MO,WE",
            "2026-09-01T10:00:00.000Z",
            new Date("2026-09-21T00:00:00.000Z"),
            new Date("2026-09-23T23:59:59.999Z"),
        );
        expect(days).toEqual(["2026-09-21", "2026-09-23"]); // not Tuesday the 22nd
    });

    it("still lists days before the routine was created, whatever day that was", () => {
        // Created on Wednesday the 23rd: the Monday before is still a Mon/Wed day.
        const days = habitOccurrences(
            "FREQ=WEEKLY;BYDAY=MO,WE",
            "2026-09-23T10:00:00.000Z",
            new Date("2026-09-21T00:00:00.000Z"),
            new Date("2026-09-23T23:59:59.999Z"),
        );
        expect(days).toEqual(["2026-09-21", "2026-09-23"]);
        // A plain monthly rule keeps its day of the month.
        expect(habitOccurrences("FREQ=MONTHLY", "2026-09-15T10:00:00.000Z", new Date("2026-07-01T00:00:00.000Z"), new Date("2026-08-31T00:00:00.000Z")))
            .toEqual(["2026-07-15", "2026-08-15"]);
    });

    it("counts an every-N rule from the creation day in the user's zone", () => {
        // 9 pm in New York on the 21st is the 22nd in UTC.
        const created = "2026-09-22T01:00:00.000Z";
        const window = [new Date("2026-09-19T00:00:00.000Z"), new Date("2026-09-25T23:59:59.999Z")] as const;
        expect(habitOccurrences("FREQ=DAILY;INTERVAL=2", created, ...window, "America/New_York")).toEqual(["2026-09-21", "2026-09-23", "2026-09-25"]);
        expect(localDay(created, "America/New_York")).toBe("2026-09-21");
    });
});

describe("stepDayStatus", () => {
    const ids = ["water", "stretch", "journal"];
    it("is done once every step is settled, pending while some are, and drops removed steps", () => {
        expect(stepDayStatus(ids, {})).toEqual({ status: "PENDING", stepStatus: null });
        expect(stepDayStatus(ids, { water: "COMPLETED", gone: "COMPLETED" })).toEqual({ status: "PENDING", stepStatus: { water: "COMPLETED" } });
        expect(stepDayStatus(ids, { water: "COMPLETED", stretch: "SKIPPED", journal: "COMPLETED" }).status).toBe("COMPLETED");
        expect(stepDayStatus(ids, { water: "SKIPPED", stretch: "SKIPPED", journal: "SKIPPED" }).status).toBe("SKIPPED");
    });

    it("reads a day checked off as a whole as every step done", () => {
        expect(stepMarksOn(["a", "b"], { status: "COMPLETED" })).toEqual({ a: "COMPLETED", b: "COMPLETED" });
        expect(stepMarksOn(["a", "b"], { status: "PENDING", stepStatus: { b: "SKIPPED" } })).toEqual({ b: "SKIPPED" });
        expect(stepMarksOn(["a"], undefined)).toEqual({});
    });
});
