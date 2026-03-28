import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskCard } from "../../../app/components/tasks/TaskCard";

vi.mock("../../../app/components/tasks/TaskCheckbox", () => ({
    TaskCheckbox: ({ task, subtask }: { task?: { title: string }; subtask?: { title: string } }) => (
        <div>{task?.title ?? subtask?.title ?? "checkbox"}</div>
    ),
}));

vi.mock("../../../app/components/tasks/TaskContextMenu", () => ({
    TaskContextMenu: () => <div>menu</div>,
}));

vi.mock("../../../app/components/tasks/RenameTaskDialog", () => ({
    RenameTaskDialog: () => null,
}));

vi.mock("../../../app/components/tasks/SortableSubtaskList", () => ({
    SortableSubtaskList: () => null,
}));

vi.mock("../../../app/hooks/tasks/use-subtasks", () => ({
    useCreateSubtask: () => ({ mutate: vi.fn() }),
    useDeleteSubtask: () => ({ mutate: vi.fn() }),
    useReorderSubtasks: () => ({ mutate: vi.fn() }),
}));

vi.mock("../../../app/stores/task-selection-store", () => ({
    useTaskSelectionStore: () => ({
        toggleTask: vi.fn(),
        selectedTaskIds: new Set<string>(),
    }),
}));

vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({
    useShellMode: () => ({ isPhone: false }),
}));

const baseTask = {
    id: "task-1",
    userId: "user-1",
    projectId: null,
    title: "Call landlord about hallway leak",
    content: null,
    state: "ACTIVE" as const,
    orderIndex: 0,
    isAllDay: true,
    dueDate: "2026-03-25",
    scheduledStart: null,
    scheduledEnd: null,
    durationEstimate: null,
    timezoneLocked: false,
    createdAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
    priority: 0 as const,
    isPinned: false,
    reminderAt: null,
    reminderSilenced: false,
    recurrenceRule: null,
    interactionMode: "task" as const,
    effort: null,
    tagIds: [],
};

describe("TaskCard overdue presentation", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-28T12:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("appends Past Due to the date row and hides the verbose overdue rationale chip", () => {
        render(
            <TaskCard
                task={baseTask}
                rationaleLabel="This task is past its due date"
            />,
        );

        expect(screen.getByText("Mar 25")).toBeTruthy();
        expect(screen.getByText("(Past Due)")).toBeTruthy();
        expect(screen.queryByText("This task is past its due date")).toBeNull();
    });
});
