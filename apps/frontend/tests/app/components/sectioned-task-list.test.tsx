import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionedTaskList } from "../../../app/components/tasks/SectionedTaskList";
import type { TaskSection } from "@cadence/contracts/section";
import type { Task } from "@cadence/contracts/task";
import { makeTask } from "../../helpers";

const mocks = vi.hoisted(() => {
    const mutation = { mutate: vi.fn() };
    return { mutation, useSections: vi.fn(), useCreateSection: vi.fn(() => mutation) };
});

vi.mock("../../../app/hooks/sections/use-sections", () => ({
    useSections: mocks.useSections,
    useCreateSection: mocks.useCreateSection,
    useUpdateSection: () => mocks.mutation,
    useDeleteSection: () => mocks.mutation,
}));

vi.mock("../../../app/hooks/tasks/use-update-task", () => ({
    useUpdateTask: () => ({ mutate: vi.fn() }),
}));

vi.mock("../../../app/components/tasks/TaskList", () => ({
    TaskList: ({ tasks }: { tasks: Task[] }) => (
        <div data-testid="task-list">{tasks.map((task) => task.title).join(", ")}</div>
    ),
}));

vi.mock("../../../app/components/tasks/AddTaskInput", () => ({
    AddTaskInput: () => <div data-testid="add-task-input" />,
}));

const section = (overrides: Partial<TaskSection>): TaskSection => ({
    id: "section-1", userId: "user-1", projectId: null, name: "Section", orderIndex: 1, createdAt: "2026-03-15T00:00:00.000Z",
    ...overrides,
});

describe("SectionedTaskList", () => {
    beforeEach(() => vi.clearAllMocks());

    it("keeps tasks in one normalized list until the user creates a section", () => {
        mocks.useSections.mockReturnValue({ data: [] });

        render(
            <SectionedTaskList
                projectId={null}
                tasks={[
                    makeTask({ id: "task-a", title: "First task" }),
                    makeTask({ id: "task-b", title: "Second task" }),
                ]}
            />,
        );

        expect(mocks.useSections).toHaveBeenCalledWith(null);
        expect(screen.queryByText("Unsectioned")).toBeNull();
        expect(screen.getAllByTestId("task-list")).toHaveLength(1);
        expect(screen.getByText("First task, Second task")).toBeTruthy();
    });

    it("uses the holding section scope when no project is active", () => {
        mocks.useSections.mockReturnValue({
            data: [section({ id: "holding-section", name: "Holding", projectId: null })],
        });

        render(
            <SectionedTaskList
                projectId={null}
                tasks={[
                    makeTask({ id: "holding-task", title: "Holding task", sectionId: "holding-section" }),
                ]}
            />,
        );

        expect(mocks.useSections).toHaveBeenCalledWith(null);
        expect(mocks.useCreateSection).toHaveBeenCalledWith(null);
        expect(screen.getByText("Holding")).toBeTruthy();
        expect(screen.getByText("Holding task")).toBeTruthy();
    });

    it("uses the active project section scope so kanban and list share sections", () => {
        mocks.useSections.mockReturnValue({
            data: [section({ id: "project-section", name: "Backlog", projectId: "project-123" })],
        });

        render(
            <SectionedTaskList
                projectId="project-123"
                tasks={[
                    makeTask({ id: "ungrouped-task", title: "Ungrouped task", sectionId: null, projectId: "project-123" }),
                    makeTask({ id: "sectioned-task", title: "Scoped task", sectionId: "project-section", projectId: "project-123" }),
                ]}
            />,
        );

        expect(mocks.useSections).toHaveBeenCalledWith("project-123");
        expect(mocks.useCreateSection).toHaveBeenCalledWith("project-123");
        expect(screen.getByText("Backlog")).toBeTruthy();
        expect(screen.getByText("Unsectioned")).toBeTruthy();
        expect(screen.getByText("Ungrouped task")).toBeTruthy();
        expect(screen.getByText("Scoped task")).toBeTruthy();
    });
});
