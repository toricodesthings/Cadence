import { describe, expect, it } from "vitest";
import { expandScheduleScopedTasks } from "../../src/lib/task-recurrence";

const BASE_TASK = {
    id: "series-1",
    title: "Calculus II lecture",
    dueDate: null,
    scheduledStart: "2026-03-10T09:30:00.000Z",
    scheduledEnd: "2026-03-10T10:45:00.000Z",
    durationEstimate: 75,
    isAllDay: false,
    recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502T235959Z",
    orderIndex: 10,
    isPinned: false,
    tagIds: ["tag-1"],
    state: "ACTIVE",
    interactionMode: "task" as const,
};

describe("task recurrence expansion", () => {
    it("expands weekly recurring time blocks into virtual schedule instances", () => {
        const items = expandScheduleScopedTasks([BASE_TASK], {
            scheduledRangeStart: "2026-03-09T00:00:00.000Z",
            scheduledRangeEnd: "2026-03-15T23:59:59.999Z",
        });

        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            id: "series-1::2026-03-10T09:30:00.000Z",
            seriesId: "series-1",
            isRecurringInstance: true,
            occurrenceStart: "2026-03-10T09:30:00.000Z",
            occurrenceEnd: "2026-03-10T10:45:00.000Z",
            scheduledStart: "2026-03-10T09:30:00.000Z",
            scheduledEnd: "2026-03-10T10:45:00.000Z",
            tagIds: ["tag-1"],
        });
        expect(items[1]).toMatchObject({
            id: "series-1::2026-03-12T09:30:00.000Z",
            occurrenceStart: "2026-03-12T09:30:00.000Z",
            occurrenceEnd: "2026-03-12T10:45:00.000Z",
        });
    });

    it("does not emit expired recurring series", () => {
        const items = expandScheduleScopedTasks(
            [
                {
                    ...BASE_TASK,
                    recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260308T235959Z",
                },
            ],
            {
                scheduledRangeStart: "2026-03-09T00:00:00.000Z",
                scheduledRangeEnd: "2026-03-15T23:59:59.999Z",
            },
        );

        expect(items).toHaveLength(0);
    });

    it("preserves passive timetable interaction mode on recurring instances", () => {
        const items = expandScheduleScopedTasks(
            [
                {
                    ...BASE_TASK,
                    interactionMode: "timetable",
                },
            ],
            {
                scheduledRangeStart: "2026-03-09T00:00:00.000Z",
                scheduledRangeEnd: "2026-03-15T23:59:59.999Z",
            },
        );

        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            interactionMode: "timetable",
            isRecurringInstance: true,
        });
    });
});
