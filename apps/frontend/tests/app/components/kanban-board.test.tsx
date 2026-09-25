import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "../../../app/components/kanban/KanbanBoard";

vi.mock("../../../app/hooks/sections/use-sections", () => {
    const sections = { data: [] };
    const mutation = { mutate: vi.fn() };
    return {
        useSections: () => sections,
        useCreateSection: () => mutation,
        useUpdateSection: () => mutation,
        useDeleteSection: () => mutation,
    };
});

vi.mock("../../../app/hooks/tasks/use-subtasks", () => {
    const subtasks = { data: {} };
    return { useSubtasksByTaskIds: () => subtasks };
});

vi.mock("../../../app/hooks/tasks/use-update-task", () => {
    const mutation = { mutate: vi.fn() };
    return { useUpdateTask: () => mutation };
});

vi.mock("../../../app/hooks/tags/use-tags", () => {
    const tags = { data: [] };
    return { useTags: () => tags };
});

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
    it("keeps the Unsectioned column and add-section trigger visible for an empty project board", () => {
        const { container } = render(<KanbanBoard tasks={[]} projectId="project-1" />);

        expect(screen.getByText("Unsectioned")).toBeTruthy();
        expect(screen.getByTestId("add-task-ungrouped")).toBeTruthy();
        expect(container.querySelector("[data-add-section-trigger]")).toBeTruthy();
    });
});
