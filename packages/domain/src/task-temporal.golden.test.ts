import { describe, expect, it } from "vitest";
import { classifyTaskReadShape, type TaskReadShape, type TaskTemporalFields } from "./task-temporal";

/**
 * Golden cross-consistency table — the regression net that previously required
 * keeping the backend classifier and the frontend `getTaskScheduleKind` in sync.
 * One classifier now serves both surfaces; this asserts it covers every branch.
 */
const CASES: Array<{ name: string; fields: TaskTemporalFields; expected: TaskReadShape }> = [
    {
        name: "no temporal fields → unscheduled",
        fields: {},
        expected: "unscheduled",
    },
    {
        name: "timed start, all-day false, no deadline → timed_block",
        fields: { isAllDay: false, scheduledStart: "2026-03-10T14:00:00.000Z" },
        expected: "timed_block",
    },
    {
        name: "timed start + deadline, all-day false → legacy_mixed_timed_deadline",
        fields: { isAllDay: false, dueDate: "2026-03-10T00:00:00.000Z", scheduledStart: "2026-03-10T14:00:00.000Z" },
        expected: "legacy_mixed_timed_deadline",
    },
    {
        name: "all-day deadline + end → all_day_duration",
        fields: { isAllDay: true, dueDate: "2026-03-10T12:00:00.000Z", scheduledEnd: "2026-03-12T23:59:59.999Z" },
        expected: "all_day_duration",
    },
    {
        name: "all-day deadline + stray start → legacy_all_day_with_start",
        fields: { isAllDay: true, dueDate: "2026-03-10T12:00:00.000Z", scheduledStart: "2026-03-10T09:00:00.000Z" },
        expected: "legacy_all_day_with_start",
    },
    {
        name: "all-day deadline only → deadline_only",
        fields: { isAllDay: true, dueDate: "2026-03-10T12:00:00.000Z" },
        expected: "deadline_only",
    },
    {
        name: "all-day start only (no deadline) → legacy_all_day_with_start",
        fields: { isAllDay: true, scheduledStart: "2026-03-10T09:00:00.000Z" },
        expected: "legacy_all_day_with_start",
    },
    {
        name: "all-day end only (no deadline/start) → deadline_only (fallback)",
        fields: { isAllDay: true, scheduledEnd: "2026-03-12T23:59:59.999Z" },
        expected: "deadline_only",
    },
];

describe("classifyTaskReadShape golden table", () => {
    for (const { name, fields, expected } of CASES) {
        it(name, () => {
            expect(classifyTaskReadShape(fields)).toBe(expected);
        });
    }

    it("covers every TaskReadShape value", () => {
        const covered = new Set(CASES.map((c) => c.expected));
        const all: TaskReadShape[] = [
            "unscheduled",
            "deadline_only",
            "timed_block",
            "all_day_duration",
            "legacy_all_day_with_start",
            "legacy_mixed_timed_deadline",
        ];
        for (const shape of all) {
            expect(covered.has(shape)).toBe(true);
        }
    });
});
