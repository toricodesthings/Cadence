import { describe, expect, it } from "vitest";
import { AppError } from "../../src/lib/errors";
import {
    classifyTaskReadShape,
    hasTaskTemporalMutation,
    normalizeTaskTemporalFields,
} from "../../src/lib/task-normalization";

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

    it("canonicalizes timed blocks by clearing dueDate", () => {
        expect(
            normalizeTaskTemporalFields({
                isAllDay: false,
                dueDate: "2026-03-10",
                scheduledStart: "2026-03-10T14:00:00.000Z",
                scheduledEnd: "2026-03-10T15:30:00.000Z",
            }),
        ).toEqual({
            dueDate: null,
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
        ).toThrowError(AppError);
    });

    it("rejects reversed ranges", () => {
        expect(() =>
            normalizeTaskTemporalFields({
                isAllDay: true,
                dueDate: "2026-03-12",
                scheduledEnd: "2026-03-10",
            }),
        ).toThrowError(AppError);
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
