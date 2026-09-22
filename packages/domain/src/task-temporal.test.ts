import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import {
    classifyTaskReadShape,
    hasTaskTemporalMutation,
    normalizeEndBoundary,
    normalizeStartBoundary,
    normalizeTaskTemporalFields,
} from "./task-temporal";

describe("range boundary normalization", () => {
    it("expands date-only boundaries to the inclusive start/end of that UTC day", () => {
        expect(normalizeStartBoundary("2026-03-01")).toBe("2026-03-01T00:00:00.000Z");
        expect(normalizeEndBoundary("2026-03-31")).toBe("2026-03-31T23:59:59.999Z");
    });

    it("passes full datetimes through unchanged", () => {
        const iso = "2026-03-01T12:30:00.000Z";
        expect(normalizeStartBoundary(iso)).toBe(iso);
        expect(normalizeEndBoundary(iso)).toBe(iso);
    });
});

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
