import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionedTaskList } from "../../../app/components/tasks/SectionedTaskList";
import type { Task, TaskSection } from "../../../app/types/task";

const useSectionsMock = vi.fn();
const useCreateSectionMock = vi.fn();
const useUpdateSectionMock = vi.fn();
const useDeleteSectionMock = vi.fn();

vi.mock("../../../app/hooks/sections", () => ({
    useSections: (projectId?: string | null) => useSectionsMock(projectId),
    useCreateSection: (projectId?: string | null) => useCreateSectionMock(projectId),
    useUpdateSection: (projectId?: string | null) => useUpdateSectionMock(projectId),
    useDeleteSection: (projectId?: string | null) => useDeleteSectionMock(projectId),
}));

vi.mock("../../../app/hooks/tasks", () => ({
    useUpdateTask: () => ({ mutate: vi.fn() }),
}));

vi.mock("../../../app/components/tasks/TaskList", () => ({
    TaskList: ({ tasks }: { tasks: Task[] }) => (
        <div data-testid="task-list">{tasks.map((task) => task.title).join(", ")}</div>
    ),
}));

function makeTask(overrides: Partial<Task>): Task {
    return {
        id: overrides.id ?? "task-1",
        userId: "user-1",
        projectId: null,
        sectionId: null,
        title: "Task",
        content: null,
        state: "ACTIVE",
        orderIndex: 1000,
        isAllDay: false,
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        durationEstimate: null,
        timezoneLocked: false,
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: "2026-03-15T00:00:00.000Z",
        priority: 0,
        isPinned: false,
        reminderAt: null,
        reminderSilenced: false,
        recurrenceRule: null,
        interactionMode: "task",
        effort: null,
        ...overrides,
    };
}

function makeSection(overrides: Partial<TaskSection>): TaskSection {
    return {
        id: overrides.id ?? "section-1",
        userId: "user-1",
        projectId: null,
        name: "Section",
        orderIndex: 1,
        createdAt: "2026-03-15T00:00:00.000Z",
        ...overrides,
    };
}

describe("SectionedTaskList", () => {
    beforeEach(() => {
        useSectionsMock.mockReset();
        useCreateSectionMock.mockReset();
        useUpdateSectionMock.mockReset();
        useDeleteSectionMock.mockReset();

        useCreateSectionMock.mockReturnValue({ mutate: vi.fn() });
        useUpdateSectionMock.mockReturnValue({ mutate: vi.fn() });
        useDeleteSectionMock.mockReturnValue({ mutate: vi.fn() });
    });

    it("keeps tasks in one normalized list until the user creates a section", () => {
        useSectionsMock.mockReturnValue({ data: [] });

        render(
            <SectionedTaskList
                projectId={null}
                tasks={[
                    makeTask({ id: "task-a", title: "First task" }),
                    makeTask({ id: "task-b", title: "Second task" }),
                ]}
            />,
        );

        expect(useSectionsMock).toHaveBeenCalledWith(null);
        expect(screen.queryByText("Unsectioned")).toBeNull();
        expect(screen.getAllByTestId("task-list")).toHaveLength(1);
        expect(screen.getByText("First task, Second task")).toBeTruthy();
    });

    it("uses the holding section scope when no project is active", () => {
        useSectionsMock.mockReturnValue({
            data: [makeSection({ id: "holding-section", name: "Holding", projectId: null })],
        });

        render(
            <SectionedTaskList
                projectId={null}
                tasks={[
                    makeTask({ id: "holding-task", title: "Holding task", sectionId: "holding-section" }),
                ]}
            />,
        );

        expect(useSectionsMock).toHaveBeenCalledWith(null);
        expect(useCreateSectionMock).toHaveBeenCalledWith(null);
        expect(screen.getByText("Holding")).toBeTruthy();
        expect(screen.getByText("Holding task")).toBeTruthy();
    });

    it("uses the active project section scope so kanban and list share sections", () => {
        useSectionsMock.mockReturnValue({
            data: [makeSection({ id: "project-section", name: "Backlog", projectId: "project-123" })],
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

        expect(useSectionsMock).toHaveBeenCalledWith("project-123");
        expect(useCreateSectionMock).toHaveBeenCalledWith("project-123");
        expect(screen.getByText("Backlog")).toBeTruthy();
        expect(screen.getByText("Unsectioned")).toBeTruthy();
        expect(screen.getByText("Ungrouped task")).toBeTruthy();
        expect(screen.getByText("Scoped task")).toBeTruthy();
    });
});
