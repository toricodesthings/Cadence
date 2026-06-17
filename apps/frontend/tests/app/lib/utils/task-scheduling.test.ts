import { describe, expect, it } from "vitest";
import {
    buildTasksQuery,
    getTaskMutationTargetId,
    getTaskRecurrenceSummary,
    getTaskScheduleSummary,
    getTaskTimelineAnchor,
    isRecurringTaskInstance,
    normalizeTaskWriteTemporalInput,
} from "../../../../app/lib/utils/task/task-scheduling";
import { formatTime } from "../../../../app/lib/utils/date-format";
import type { Task } from "@cadence/contracts/task";

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
        interactionMode: "task",
        sectionId: null,
        seriesId: undefined,
        isRecurringInstance: false,
        occurrenceStart: null,
        occurrenceEnd: null,
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

    it("formats recurring series metadata without exposing raw RRULE text", () => {
        const task = createTask({
            isAllDay: false,
            scheduledStart: "2026-03-10T13:30:00.000Z",
            scheduledEnd: "2026-03-10T14:45:00.000Z",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502T235959Z",
        });
        const timeLabel = `${formatTime(task.scheduledStart!)} - ${formatTime(task.scheduledEnd!)}`;

        expect(getTaskRecurrenceSummary(task)).toEqual({
            label: `Repeats Tue & Thu, ${timeLabel}, until May 2`,
            cadenceLabel: "Repeats Tue & Thu",
            detailLabel: `every Tue & Thu, ${timeLabel}, until May 2`,
            weekdayLabel: "Tue & Thu",
            endLabel: "May 2",
        });
    });

    it("routes recurring instances back to their series master for mutations", () => {
        const instance = createTask({
            id: "series-1::2026-03-10T09:30:00.000Z",
            seriesId: "series-1",
            isRecurringInstance: true,
        });

        expect(isRecurringTaskInstance(instance)).toBe(true);
        expect(getTaskMutationTargetId(instance)).toBe("series-1");
    });

    it("labels passive recurring timeblocks as timetable anchors and resolves their occurrence date", () => {
        const passiveSeries = createTask({
            isAllDay: false,
            interactionMode: "timetable",
            scheduledStart: "2026-03-10T09:30:00.000Z",
            scheduledEnd: "2026-03-10T10:45:00.000Z",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502T235959Z",
        });

        expect(getTaskScheduleSummary(passiveSeries)).toMatchObject({
            kind: "timed",
            secondaryLabel: "Timetable anchor",
        });

        expect(
            getTaskTimelineAnchor(passiveSeries, new Date("2026-03-11T08:00:00.000Z")),
        ).toBe("2026-03-12");
    });

    it("normalizes task write temporal fields through the canonical local date path", () => {
        expect(
            normalizeTaskWriteTemporalInput({
                title: "Book dentist",
                dueDate: "2026-06-10T12:00:00.000",
                isAllDay: true,
            }),
        ).toEqual({
            title: "Book dentist",
            dueDate: "2026-06-10",
            isAllDay: true,
        });

        const timed = normalizeTaskWriteTemporalInput({
            title: "Write brief",
            scheduledStart: "2026-06-10T14:00:00.000",
            scheduledEnd: "2026-06-10T15:30:00.000",
            isAllDay: false,
        });

        expect(timed.scheduledStart).toBe(new Date("2026-06-10T14:00:00.000").toISOString());
        expect(timed.scheduledEnd).toBe(new Date("2026-06-10T15:30:00.000").toISOString());
    });

    it("preserves already-valid task write temporal fields", () => {
        expect(
            normalizeTaskWriteTemporalInput({
                dueDate: "2026-06-10",
                scheduledStart: "2026-06-10T14:00:00.000Z",
                scheduledEnd: "2026-06-10T15:30:00.000-04:00",
            }),
        ).toEqual({
            dueDate: "2026-06-10",
            scheduledStart: "2026-06-10T14:00:00.000Z",
            scheduledEnd: "2026-06-10T15:30:00.000-04:00",
        });
    });
});
