import { describe, expect, it } from "vitest";
import { DomainError } from "@cadence/domain/errors";
import {
    classifyTaskReadShape,
    hasTaskTemporalMutation,
    normalizeHiddenUntil,
    normalizeTaskTemporalFields,
    rescheduleToDay,
    type TaskTemporal,
} from "@cadence/domain/task-temporal";

const TORONTO = "America/Toronto";

describe("normalizeTaskTemporalFields", () => {
    it("keeps a deadline as a LocalDate", () => {
        expect(normalizeTaskTemporalFields({ dueDate: "2026-03-10" }, TORONTO)).toEqual({
            dueDate: "2026-03-10",
            endDate: null,
            scheduledStart: null,
            scheduledEnd: null,
            zone: null,
        });
    });

    it("keeps a multi-day all-day task on LocalDates", () => {
        expect(normalizeTaskTemporalFields({ dueDate: "2026-03-10", endDate: "2026-03-12" }, TORONTO)).toMatchObject({
            dueDate: "2026-03-10",
            endDate: "2026-03-12",
        });
    });

    it("stores a timed block as instants plus the zone it was planned in", () => {
        expect(
            normalizeTaskTemporalFields(
                { scheduledStart: "2026-03-10T14:00:00.000Z", scheduledEnd: "2026-03-10T15:30:00.000Z", dueDate: "2026-03-10" },
                TORONTO,
            ),
        ).toEqual({
            dueDate: "2026-03-10",
            endDate: null,
            scheduledStart: "2026-03-10T14:00:00.000Z",
            scheduledEnd: "2026-03-10T15:30:00.000Z",
            zone: TORONTO,
        });
        expect(normalizeTaskTemporalFields({ scheduledStart: "2026-03-10T14:00:00Z", zone: "Asia/Tokyo" }, TORONTO).zone).toBe("Asia/Tokyo");
    });

    it("clears everything when nothing is given", () => {
        expect(normalizeTaskTemporalFields({}, TORONTO)).toEqual({ dueDate: null, endDate: null, scheduledStart: null, scheduledEnd: null, zone: null });
    });

    it("rejects bad shapes", () => {
        expect(() => normalizeTaskTemporalFields({ endDate: "2026-03-10" }, TORONTO)).toThrowError(DomainError);
        expect(() => normalizeTaskTemporalFields({ dueDate: "2026-03-12", endDate: "2026-03-10" }, TORONTO)).toThrowError(DomainError);
        expect(() => normalizeTaskTemporalFields({ scheduledStart: "2026-03-10", scheduledEnd: "2026-03-11T10:00:00Z" }, TORONTO)).not.toThrow(); // a date start is legacy all-day
        expect(() => normalizeTaskTemporalFields({ scheduledStart: "2026-03-10T14:00:00Z", scheduledEnd: "2026-03-10T13:00:00Z" }, TORONTO)).toThrowError(DomainError);
        expect(() => normalizeTaskTemporalFields({ scheduledStart: "2026-03-10T14:00:00Z", endDate: "2026-03-12" }, TORONTO)).toThrowError(DomainError);
        expect(() => normalizeTaskTemporalFields({ dueDate: "2026-03-10", scheduledStart: "2026-03-10T14:00:00Z", zone: "Not/AZone" }, TORONTO)).toThrowError(DomainError);
        expect(() => normalizeTaskTemporalFields({ dueDate: "2026-03-10" }, "Not/AZone")).toThrowError(DomainError);
    });

    describe("legacy shim", () => {
        it("reads an instant in dueDate through legacyDay and reports it", () => {
            const heard: string[] = [];
            // The old all-day anchor (noon UTC) names its UTC date; a 11:59 PM Toronto instant is the Toronto day.
            expect(normalizeTaskTemporalFields({ dueDate: "2026-10-05T12:00:00.000Z" }, TORONTO, (f) => heard.push(f)).dueDate).toBe("2026-10-05");
            expect(normalizeTaskTemporalFields({ dueDate: "2026-10-05T23:59:00-04:00" }, TORONTO).dueDate).toBe("2026-10-05");
            expect(heard).toEqual(["dueDate"]);
        });

        it("isAllDay: true with a start means the start only names the day", () => {
            const heard: string[] = [];
            const result = normalizeTaskTemporalFields({ isAllDay: true, scheduledStart: "2026-03-10T09:00:00.000Z", dueDate: "2026-03-10" }, TORONTO, (f) => heard.push(f));
            expect(result).toEqual({ dueDate: "2026-03-10", endDate: null, scheduledStart: null, scheduledEnd: null, zone: null });
            expect(heard).toContain("isAllDay");
            expect(heard).toContain("scheduledStart");
        });

        it("an old all-day end becomes endDate", () => {
            expect(normalizeTaskTemporalFields({ isAllDay: true, dueDate: "2026-03-10", scheduledEnd: "2026-03-12T23:59:59.999Z" }, TORONTO)).toMatchObject({
                dueDate: "2026-03-10",
                endDate: "2026-03-12",
            });
        });

        it("isAllDay: false without a start is rejected", () => {
            expect(() => normalizeTaskTemporalFields({ isAllDay: false, dueDate: "2026-03-10" }, TORONTO)).toThrowError(DomainError);
        });

        it("reads a legacy hide-until instant as its day", () => {
            expect(normalizeHiddenUntil("2026-03-10", TORONTO)).toBe("2026-03-10");
            expect(normalizeHiddenUntil("2026-03-10T04:00:00.000Z", TORONTO)).toBe("2026-03-10"); // Toronto local midnight
            expect(normalizeHiddenUntil(null, TORONTO)).toBeNull();
        });
    });
});

describe("rescheduleToDay", () => {
    const timed: TaskTemporal = {
        dueDate: null,
        endDate: null,
        scheduledStart: "2026-10-30T18:35:00.000Z", // Fri 14:35 EDT
        scheduledEnd: "2026-10-30T19:50:00.000Z",
        zone: TORONTO,
    };

    it("keeps the wall time across a DST change", () => {
        const moved = rescheduleToDay(timed, "2026-11-03", TORONTO);
        expect(moved.scheduledStart).toBe("2026-11-03T19:35:00.000Z"); // 14:35 EST
        expect(moved.scheduledEnd).toBe("2026-11-03T20:50:00.000Z");
        expect(moved.zone).toBe(TORONTO);
    });

    it("moves an all-day task and its end by the same number of days", () => {
        const day: TaskTemporal = { dueDate: "2026-03-10", endDate: "2026-03-12", scheduledStart: null, scheduledEnd: null, zone: null };
        expect(rescheduleToDay(day, "2026-03-20", TORONTO)).toEqual({ dueDate: "2026-03-20", endDate: "2026-03-22", scheduledStart: null, scheduledEnd: null, zone: null });
    });
});

describe("classifyTaskReadShape", () => {
    it("detects schedule mutations", () => {
        expect(hasTaskTemporalMutation({ title: "noop" } as never)).toBe(false);
        expect(hasTaskTemporalMutation({ scheduledStart: null })).toBe(true);
        expect(hasTaskTemporalMutation({ endDate: null })).toBe(true);
    });

    it("classifies the four shapes", () => {
        expect(classifyTaskReadShape({ dueDate: null, endDate: null, scheduledStart: null })).toBe("unscheduled");
        expect(classifyTaskReadShape({ dueDate: "2026-03-10", endDate: null, scheduledStart: null })).toBe("day");
        expect(classifyTaskReadShape({ dueDate: "2026-03-10", endDate: "2026-03-12", scheduledStart: null })).toBe("days");
        expect(classifyTaskReadShape({ dueDate: "2026-03-10", endDate: null, scheduledStart: "2026-03-10T14:00:00Z" })).toBe("timed");
    });
});
