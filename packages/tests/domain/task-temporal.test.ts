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
        expect(() => normalizeTaskTemporalFields({ scheduledStart: "2026-03-10" }, TORONTO)).toThrowError(DomainError); // a start is an instant
        expect(() => normalizeTaskTemporalFields({ dueDate: "2026-03-10T12:00:00Z" }, TORONTO)).toThrowError(DomainError); // a day is a day
        expect(() => normalizeTaskTemporalFields({ dueDate: "2026-03-10", scheduledEnd: "2026-03-10T13:00:00Z" }, TORONTO)).toThrowError(DomainError);
        expect(() => normalizeTaskTemporalFields({ scheduledStart: "2026-03-10T14:00:00Z", scheduledEnd: "2026-03-10T13:00:00Z" }, TORONTO)).toThrowError(DomainError);
        expect(() => normalizeTaskTemporalFields({ scheduledStart: "2026-03-10T14:00:00Z", endDate: "2026-03-12" }, TORONTO)).toThrowError(DomainError);
        expect(() => normalizeTaskTemporalFields({ dueDate: "2026-03-10", scheduledStart: "2026-03-10T14:00:00Z", zone: "Not/AZone" }, TORONTO)).toThrowError(DomainError);
        expect(() => normalizeTaskTemporalFields({ dueDate: "2026-03-10" }, "Not/AZone")).toThrowError(DomainError);
    });

    it("hide-until is a day", () => {
        expect(normalizeHiddenUntil("2026-03-10")).toBe("2026-03-10");
        expect(normalizeHiddenUntil(null)).toBeNull();
        expect(() => normalizeHiddenUntil("2026-03-10T04:00:00.000Z")).toThrowError(DomainError);
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

    // 0.30.0 (B09): moving a work block never moves the commitment it works towards.
    it("keeps the deadline when a timed block moves", () => {
        const withDeadline: TaskTemporal = { ...timed, dueDate: "2026-10-31" };
        const moved = rescheduleToDay(withDeadline, "2026-10-29", TORONTO);
        expect(moved.dueDate).toBe("2026-10-31");
        expect(moved.scheduledStart).toBe("2026-10-29T18:35:00.000Z");
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
