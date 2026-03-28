import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "../../../app/components/kanban/KanbanBoard";

const useSectionsMock = vi.fn();
const useCreateSectionMock = vi.fn();
const useUpdateSectionMock = vi.fn();
const useDeleteSectionMock = vi.fn();
const useSubtasksByTaskIdsMock = vi.fn();
const useUpdateTaskMock = vi.fn();
const useTagsMock = vi.fn();

vi.mock("../../../app/hooks/sections", () => ({
    useSections: (projectId?: string | null) => useSectionsMock(projectId),
    useCreateSection: (projectId?: string | null) => useCreateSectionMock(projectId),
    useUpdateSection: (projectId?: string | null) => useUpdateSectionMock(projectId),
    useDeleteSection: (projectId?: string | null) => useDeleteSectionMock(projectId),
}));

vi.mock("../../../app/hooks/tasks/use-subtasks", () => ({
    useSubtasksByTaskIds: (taskIds: string[]) => useSubtasksByTaskIdsMock(taskIds),
}));

vi.mock("../../../app/hooks/tasks", () => ({
    useUpdateTask: () => useUpdateTaskMock(),
}));

vi.mock("../../../app/hooks/tags", () => ({
    useTags: () => useTagsMock(),
}));

vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({
    useShellMode: () => ({
        isCompact: false,
        isPhone: false,
        isWide: true,
    }),
}));

vi.mock("../../../app/hooks/ui/use-drag-scroll", () => ({
    useDragScroll: () => ({
        ref: { current: null },
        onPointerDown: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onPointerCancel: vi.fn(),
    }),
}));

vi.mock("../../../app/components/tasks/SortableTaskCard", () => ({
    SortableTaskCard: ({ task }: { task: { title: string } }) => <div>{task.title}</div>,
}));

vi.mock("../../../app/components/tasks/AddTaskInput", () => ({
    AddTaskInput: ({ sectionId }: { sectionId?: string }) => (
        <div data-testid={`add-task-${sectionId ?? "ungrouped"}`} />
    ),
}));

vi.mock("../../../app/components/tasks/TaskContextMenuWrapper", () => ({
    TaskContextMenuWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../app/components/tasks/RenameTaskDialog", () => ({
    RenameTaskDialog: () => null,
}));

describe("KanbanBoard", () => {
    beforeEach(() => {
        useSectionsMock.mockReset();
        useCreateSectionMock.mockReset();
        useUpdateSectionMock.mockReset();
        useDeleteSectionMock.mockReset();
        useSubtasksByTaskIdsMock.mockReset();
        useUpdateTaskMock.mockReset();
        useTagsMock.mockReset();

        useSectionsMock.mockReturnValue({ data: [] });
        useCreateSectionMock.mockReturnValue({ mutate: vi.fn() });
        useUpdateSectionMock.mockReturnValue({ mutate: vi.fn() });
        useDeleteSectionMock.mockReturnValue({ mutate: vi.fn() });
        useSubtasksByTaskIdsMock.mockReturnValue({ data: {} });
        useUpdateTaskMock.mockReturnValue({ mutate: vi.fn() });
        useTagsMock.mockReturnValue({ data: [] });
    });

    it("keeps the Unsectioned column and add-section trigger visible for an empty project board", () => {
        const { container } = render(<KanbanBoard tasks={[]} projectId="project-1" />);

        expect(screen.getByText("Unsectioned")).toBeTruthy();
        expect(screen.getByTestId("add-task-ungrouped")).toBeTruthy();
        expect(container.querySelector("[data-add-section-trigger]")).toBeTruthy();
    });
});
