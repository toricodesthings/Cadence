import { describe, expect, it } from "vitest";
import { classifyTaskReadShape, type TaskReadShape, type TaskTemporal } from "@cadence/domain/task-temporal";

/**
 * Golden table: one classifier serves backend and frontend; this asserts it covers every shape.
 */
type Fields = Pick<TaskTemporal, "dueDate" | "endDate" | "scheduledStart">;
const NONE: Fields = { dueDate: null, endDate: null, scheduledStart: null };
const CASES: Array<{ name: string; fields: Fields; expected: TaskReadShape }> = [
    { name: "no temporal fields → unscheduled", fields: NONE, expected: "unscheduled" },
    { name: "an end without a day → unscheduled", fields: { ...NONE, endDate: "2026-03-12" }, expected: "unscheduled" },
    { name: "a deadline day → day", fields: { ...NONE, dueDate: "2026-03-10" }, expected: "day" },
    { name: "a day and an end → days", fields: { ...NONE, dueDate: "2026-03-10", endDate: "2026-03-12" }, expected: "days" },
    { name: "a start → timed", fields: { ...NONE, scheduledStart: "2026-03-10T14:00:00.000Z" }, expected: "timed" },
    { name: "a start with a deadline day → timed", fields: { ...NONE, dueDate: "2026-03-10", scheduledStart: "2026-03-10T14:00:00.000Z" }, expected: "timed" },
];

describe("classifyTaskReadShape golden table", () => {
    for (const { name, fields, expected } of CASES) {
        it(name, () => {
            expect(classifyTaskReadShape(fields)).toBe(expected);
        });
    }

    it("covers every TaskReadShape value", () => {
        const all: TaskReadShape[] = ["unscheduled", "day", "days", "timed"];
        const covered = new Set(CASES.map((c) => c.expected));
        for (const shape of all) expect(covered.has(shape)).toBe(true);
    });
});
