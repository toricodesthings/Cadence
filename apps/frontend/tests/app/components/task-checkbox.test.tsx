import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskCheckbox } from "../../../app/components/tasks/TaskCheckbox";
import type { Task } from "@cadence/contracts/task";
import { Provider } from "../../../app/components/primitives/Tooltip";
import { makeTask } from "../../helpers";

const updateTaskMutateMock = vi.fn();
const updateSubtaskMutateMock = vi.fn();
const queueCompletionMock = vi.fn();
const noop = vi.fn();

let access = { role: "owner", isShared: false, canEdit: true, isOwner: true };
vi.mock("../../../app/hooks/sharing/use-list-access", () => ({
    useTaskAccess: () => access,
    useListAccess: () => access,
}));

vi.mock("../../../app/hooks/tasks/use-update-task", () => ({
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
    useTaskCompletionStore: (select: (state: object) => unknown) =>
        select({
            pendingById: {},
            queueCompletion: queueCompletionMock,
            cancelCompletion: noop,
            clearCompletion: noop,
        }),
}));

const createTask = (overrides: Partial<Task> = {}) =>
    makeTask({
        scheduledStart: "2026-03-10T09:30:00.000Z",
        scheduledEnd: "2026-03-10T10:45:00.000Z",
        durationEstimate: 75,
        timezoneLocked: true,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
        ...overrides,
    });

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

        const checkbox = screen.getByRole("button", { name: "Calculus lecture is fixed, no check-off" });
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

    it("shows a task in a list you can only view, and doesn't let it be checked off", () => {
        access = { role: "view", isShared: true, canEdit: false, isOwner: false };
        render(
            <Provider>
                <TaskCheckbox task={makeTask({ title: "Buy milk" })} />
            </Provider>,
        );
        const checkbox = screen.getByRole("button", { name: "Buy milk: view only" });
        expect(checkbox.hasAttribute("disabled")).toBe(true);
        fireEvent.click(checkbox);
        expect(queueCompletionMock).not.toHaveBeenCalled();
        access = { role: "owner", isShared: false, canEdit: true, isOwner: true };
    });
});
