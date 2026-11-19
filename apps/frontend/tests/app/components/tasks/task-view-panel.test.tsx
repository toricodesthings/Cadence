import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "../../../helpers";

const state = vi.hoisted(() => ({
    subtasks: [] as { id: string; title: string; isComplete: boolean }[],
    note: { loaded: true, body: "" },
}));

vi.mock("../../../../app/hooks/sections/use-sections", () => ({
    useSections: () => ({ data: [{ id: "s1", name: "Packing" }] }),
}));
vi.mock("../../../../app/hooks/tasks/use-subtasks", () => ({ useSubtasks: () => ({ data: state.subtasks }) }));
vi.mock("../../../../app/hooks/tasks/use-task-note", () => ({ useTaskNote: () => ({ state: state.note }) }));
vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: {} }) }));
vi.mock("../../../../app/components/shared/DetailPanelLayout", () => ({
    DetailPanelLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../app/components/tasks/TaskCheckbox", () => ({ TaskCheckbox: () => <span /> }));
vi.mock("../../../../app/components/sharing/CreatedBy", () => ({ CreatedBy: () => null }));
vi.mock("../../../../app/components/tasks/TaskNoteInline", () => ({ TaskNoteInline: () => <p>note body</p> }));

import { TaskViewPanel } from "../../../../app/components/tasks/TaskViewPanel";

const task = makeTask({
    title: "Book train tickets",
    dueDate: "2026-11-21",
    priority: 3,
    effort: 2,
    sectionId: "s1",
    projectId: "11111111-1111-4111-8111-111111111111",
});

beforeEach(() => {
    state.subtasks = [];
    state.note = { loaded: true, body: "" };
});

describe("a task in a list you can only view", () => {
    it("shows what's set as facts, with nothing to type into or pick", () => {
        render(<TaskViewPanel task={task} onClose={() => {}} />);
        expect(screen.getByRole("heading", { name: "Book train tickets" })).toBeTruthy();
        expect(screen.getByRole("group", { name: "Deadline" })).toBeTruthy();
        expect(screen.getByRole("group", { name: "Priority" }).textContent).toContain("High");
        expect(screen.getByRole("group", { name: "Effort" }).textContent).toContain("Medium");
        expect(screen.getByRole("group", { name: "Section" }).textContent).toContain("Packing");
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(screen.queryByRole("combobox")).toBeNull();
        expect(screen.queryByRole("switch")).toBeNull();
        expect(screen.queryByText(/Trash/)).toBeNull();
        expect(screen.queryByRole("group", { name: "Hidden until" })).toBeNull();
    });

    it("states empty notes and subtasks without offering to open them", () => {
        render(<TaskViewPanel task={task} onClose={() => {}} />);
        expect(screen.getByText("No notes")).toBeTruthy();
        expect(screen.getByText("No subtasks")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Notes/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Subtasks/ })).toBeNull();
    });

    it("opens the note and the steps to read", async () => {
        state.note = { loaded: true, body: "Window seats please" };
        state.subtasks = [{ id: "a", title: "Compare fares", isComplete: true }];
        render(<TaskViewPanel task={task} onClose={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: /Notes.*3 words/ }));
        expect(await screen.findByText("note body")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Subtasks.*1\/1 complete/ }));
        expect(screen.getByText("Compare fares")).toBeTruthy();
    });
});
