import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskCheckbox } from "../../../app/components/tasks/TaskCheckbox";
import type { Task } from "@cadence/contracts/task";

const updateTaskMutateMock = vi.fn();
const updateSubtaskMutateMock = vi.fn();
const queueCompletionMock = vi.fn();
const cancelCompletionMock = vi.fn();
const clearCompletionMock = vi.fn();

vi.mock("../../../app/hooks/tasks", () => ({
    useUpdateTask: () => ({
        mutate: updateTaskMutateMock,
    }),
}));

vi.mock("../../../app/hooks/tasks/use-subtasks", () => ({
    useUpdateSubtask: () => ({
        mutate: updateSubtaskMutateMock,
    }),
}));

vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({
        data: {
            tasks: {
                showDoneCelebration: false,
            },
        },
    }),
}));

vi.mock("../../../app/stores/task-completion-store", () => ({
    useTaskCompletionStore: (selector: (state: {
        pendingById: Record<string, unknown>;
        queueCompletion: typeof queueCompletionMock;
        cancelCompletion: typeof cancelCompletionMock;
        clearCompletion: typeof clearCompletionMock;
    }) => unknown) =>
        selector({
            pendingById: {},
            queueCompletion: queueCompletionMock,
            cancelCompletion: cancelCompletionMock,
            clearCompletion: clearCompletionMock,
        }),
}));

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: "task-1",
        userId: "user-1",
        projectId: null,
        title: "Task",
        content: null,
        state: "ACTIVE",
        orderIndex: 1,
        isAllDay: false,
        dueDate: null,
        scheduledStart: "2026-03-10T09:30:00.000Z",
        scheduledEnd: "2026-03-10T10:45:00.000Z",
        durationEstimate: 75,
        timezoneLocked: true,
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z",
        priority: 0,
        isPinned: false,
        reminderAt: null,
        reminderSilenced: false,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
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

describe("TaskCheckbox", () => {
    it("suppresses completion affordances for passive timetable anchors", () => {
        render(
            <TaskCheckbox
                task={createTask({
                    title: "Calculus lecture",
                    interactionMode: "timetable",
                })}
            />,
        );

        const checkbox = screen.getByRole("button", { name: "Calculus lecture is a timetable anchor" });
        expect(checkbox.hasAttribute("disabled")).toBe(true);

        fireEvent.click(checkbox);

        expect(queueCompletionMock).not.toHaveBeenCalled();
        expect(updateTaskMutateMock).not.toHaveBeenCalled();
    });

    it("keeps manual task completion enabled for normal recurring tasks", () => {
        render(<TaskCheckbox task={createTask()} />);

        fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));

        expect(queueCompletionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                taskId: "task-1",
            }),
        );
    });
});
