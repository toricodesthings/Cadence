import { describe, expect, it } from "vitest";
import { buildTasksQuery, getTaskScheduleSummary } from "../../../../app/lib/utils/task-scheduling";
import type { Task } from "../../../../app/types/task";

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: "task-1",
        userId: "user-1",
        projectId: null,
        title: "Task",
        content: null,
        state: "ACTIVE",
        orderIndex: 1,
        isAllDay: true,
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        durationEstimate: null,
        timezoneLocked: false,
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z",
        priority: 0,
        isPinned: false,
        reminderAt: null,
        reminderSilenced: false,
        recurrenceRule: null,
        effort: null,
        ...overrides,
    };
}

describe("task scheduling helpers", () => {
    it("classifies deadline, duration, timed, and legacy mixed tasks deterministically", () => {
        expect(getTaskScheduleSummary(createTask({ dueDate: "2026-03-09" }))).toMatchObject({
            kind: "deadline",
            displayMode: "deadline",
            primaryLabel: "Mar 9",
            secondaryLabel: "Deadline",
        });

        expect(
            getTaskScheduleSummary(createTask({ dueDate: "2026-03-09", scheduledEnd: "2026-03-12", isAllDay: true })),
        ).toMatchObject({
            kind: "duration",
            displayMode: "duration",
            secondaryLabel: "Duration",
        });

        expect(
            getTaskScheduleSummary(
                createTask({
                    isAllDay: false,
                    scheduledStart: "2026-03-09T09:00:00.000Z",
                    scheduledEnd: "2026-03-09T10:00:00.000Z",
                }),
            ),
        ).toMatchObject({
            kind: "timed",
            displayMode: "timed",
            secondaryLabel: "Time block",
        });

        expect(
            getTaskScheduleSummary(
                createTask({
                    isAllDay: false,
                    dueDate: "2026-03-09",
                    scheduledStart: "2026-03-09T09:00:00.000Z",
                }),
            ),
        ).toMatchObject({
            kind: "legacy-mixed-timed-deadline",
            needsNormalization: true,
        });
    });

    it("serializes extended task filters for the backend contract", () => {
        expect(
            buildTasksQuery({
                state: "ACTIVE",
                hasNoProject: true,
                hasNoDate: false,
                effectiveOnOrBeforeDate: "2026-03-09",
                scheduledRange: { start: "2026-03-01", end: "2026-03-31" },
            }),
        ).toEqual({
            state: "ACTIVE",
            scheduledRangeStart: "2026-03-01",
            scheduledRangeEnd: "2026-03-31",
            hasNoProject: "true",
            hasNoDate: "false",
            effectiveOnOrBeforeDate: "2026-03-09",
        });
    });
});
