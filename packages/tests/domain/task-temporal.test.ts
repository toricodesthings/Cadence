import { describe, expect, it } from "vitest";
import { DomainError } from "@cadence/domain/errors";
import {
    classifyTaskReadShape,
    hasTaskTemporalMutation,
    inferIsAllDay,
    normalizeTaskTemporalFields,
} from "@cadence/domain/task-temporal";

describe("task temporal normalization", () => {
    it("canonicalizes deadline-only all-day tasks", () => {
        expect(
            normalizeTaskTemporalFields({
                isAllDay: true,
                dueDate: "2026-03-10",
                scheduledStart: "2026-03-10T09:00:00.000Z",
            }),
        ).toEqual({
            dueDate: "2026-03-10T12:00:00.000Z",
            scheduledStart: null,
            scheduledEnd: null,
            isAllDay: true,
        });
    });

    it("canonicalizes timed blocks while preserving a dueDate anchor when provided", () => {
        expect(
            normalizeTaskTemporalFields({
                isAllDay: false,
                dueDate: "2026-03-10",
                scheduledStart: "2026-03-10T14:00:00.000Z",
                scheduledEnd: "2026-03-10T15:30:00.000Z",
            }),
        ).toEqual({
            dueDate: "2026-03-10T12:00:00.000Z",
            scheduledStart: "2026-03-10T14:00:00.000Z",
            scheduledEnd: "2026-03-10T15:30:00.000Z",
            isAllDay: false,
        });
    });

    it("canonicalizes all-day durations with inclusive end boundaries", () => {
        expect(
            normalizeTaskTemporalFields({
                isAllDay: true,
                dueDate: "2026-03-10",
                scheduledEnd: "2026-03-12",
            }),
        ).toEqual({
            dueDate: "2026-03-10T12:00:00.000Z",
            scheduledStart: null,
            scheduledEnd: "2026-03-12T23:59:59.999Z",
            isAllDay: true,
        });
    });

    it("rejects timed tasks without a start anchor", () => {
        expect(() =>
            normalizeTaskTemporalFields({
                isAllDay: false,
                dueDate: "2026-03-10",
            }),
        ).toThrowError(DomainError);
    });

    it("rejects reversed ranges", () => {
        expect(() =>
            normalizeTaskTemporalFields({
                isAllDay: true,
                dueDate: "2026-03-12",
                scheduledEnd: "2026-03-10",
            }),
        ).toThrowError(DomainError);
    });

    it("documents legacy read precedence", () => {
        expect(
            classifyTaskReadShape({
                isAllDay: false,
                dueDate: "2026-03-10T00:00:00.000Z",
                scheduledStart: "2026-03-10T14:00:00.000Z",
            }),
        ).toBe("legacy_mixed_timed_deadline");
    });

    it("detects schedule mutations", () => {
        expect(hasTaskTemporalMutation({ title: "noop" } as never)).toBe(false);
        expect(hasTaskTemporalMutation({ scheduledStart: null })).toBe(true);
    });
});

describe("inferIsAllDay (assistant proposals)", () => {
    const apply = (existing: Parameters<typeof normalizeTaskTemporalFields>[0], patch: Parameters<typeof inferIsAllDay>[0]) =>
        normalizeTaskTemporalFields({ ...existing, ...patch, isAllDay: inferIsAllDay(patch) ?? existing.isAllDay });

    it("an all-day task given a clock time becomes timed", () => {
        const result = apply({ isAllDay: true, dueDate: "2026-10-01" }, { scheduledStart: "2026-10-01T14:00:00-04:00" });
        expect(result).toMatchObject({ isAllDay: false, scheduledStart: "2026-10-01T14:00:00-04:00" });
    });

    it("a timed task given a date and a cleared start becomes all-day without throwing", () => {
        const result = apply(
            { isAllDay: false, scheduledStart: "2026-10-01T18:00:00.000Z" },
            { dueDate: "2026-10-03", scheduledStart: null },
        );
        expect(result).toMatchObject({ isAllDay: true, dueDate: "2026-10-03T12:00:00.000Z", scheduledStart: null });
    });

    it("creating with a timed start keeps the time, and no date change keeps what the task has", () => {
        expect(inferIsAllDay({ scheduledStart: "2026-10-01T09:30:00-04:00" })).toBe(false);
        expect(inferIsAllDay({ scheduledStart: "2026-10-01" })).toBe(true);
        expect(inferIsAllDay({})).toBeUndefined();
    });
});
