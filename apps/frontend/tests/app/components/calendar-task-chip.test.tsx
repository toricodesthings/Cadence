import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { CalendarTaskChip } from "../../../app/components/calendar/CalendarTaskChip";
import { CalendarChipActionsContext } from "../../../app/components/calendar/CalendarItem";

const { archive } = vi.hoisted(() => ({ archive: vi.fn() }));
vi.mock("../../../app/hooks/tasks/use-archive-task", () => ({
    useArchiveTask: () => ({ mutate: archive, isPending: false }),
}));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/sections/use-sections", () => ({ useAllSections: () => [] }));
vi.mock("../../../app/components/tasks/TaskCheckbox", () => ({
    TaskCheckbox: () => <button type="button" aria-label="Mark complete" />,
}));

const task = {
    id: "occurrence-1",
    seriesId: "series-1",
    title: "Weekly timetable",
    state: "ACTIVE",
    priority: 0,
    interactionMode: "timetable",
    recurrenceRule: "FREQ=WEEKLY",
    isRecurringInstance: true,
    scheduledStart: "2026-09-15T09:00:00Z",
    scheduledEnd: "2026-09-15T10:00:00Z",
} as Task;

const renderChip = (ui: React.ReactElement, actions = {}) => render(
    <TooltipProvider><CalendarChipActionsContext.Provider value={actions}>{ui}</CalendarChipActionsContext.Provider></TooltipProvider>,
);

describe("CalendarTaskChip menu", () => {
    beforeEach(() => archive.mockClear());
    it("retains a named details button in a narrow Fixed block and can change variants without changing hook order", () => {
        const select = vi.fn();
        const { rerender } = renderChip(<CalendarTaskChip task={task} variant="pill" onSelect={select} />);
        rerender(<TooltipProvider><CalendarChipActionsContext.Provider value={{}}><CalendarTaskChip task={task} variant="block" style={{ width: 48, height: 72 }} onSelect={select} /></CalendarChipActionsContext.Provider></TooltipProvider>);
        const details = screen.getByRole("button", { name: `Open details for ${task.title}` });
        expect(details.tabIndex).toBe(0);
        fireEvent.click(details);
        expect(select).toHaveBeenCalledWith(task.id);
        fireEvent.contextMenu(details);
        fireEvent.click(screen.getByRole("menuitem", { name: "Open details" }));
        expect(select).toHaveBeenCalledTimes(2);
    });
    it.each(["pill", "block"] as const)("trashes the series from a %s without opening the cell menu", (variant) => {
        const cellMenu = vi.fn();
        const select = vi.fn();
        renderChip(
            <div onContextMenu={cellMenu}>
                <CalendarTaskChip task={task} variant={variant} onSelect={select} />
            </div>,
        );
        fireEvent.contextMenu(screen.getAllByText(task.title)[0]);
        expect(cellMenu).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("menuitem", { name: "Move series to Trash" }));
        expect(archive).toHaveBeenCalledWith("series-1");
        expect(select).not.toHaveBeenCalled();
    });

    it("offers a task its day actions and Trash, with no quick Archive button on the chip", () => {
        const moveToTomorrow = vi.fn();
        renderChip(
            <CalendarTaskChip task={{ ...task, id: "task-1", seriesId: undefined, recurrenceRule: null, isRecurringInstance: false, interactionMode: "task" }} variant="pill" onSelect={vi.fn()} />,
            { moveToTomorrow },
        );
        expect(screen.getByRole("button", { name: "Mark complete" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /trash|archive/i })).toBeNull();
        fireEvent.contextMenu(screen.getAllByText(task.title)[0]);
        fireEvent.click(screen.getByRole("menuitem", { name: "Move to tomorrow" }));
        expect(moveToTomorrow).toHaveBeenCalled();
        fireEvent.contextMenu(screen.getAllByText(task.title)[0]);
        fireEvent.click(screen.getByRole("menuitem", { name: "Move to Trash" }));
        expect(archive).toHaveBeenCalledWith("task-1");
    });

    it("gives a routine Skip and Clear instead of Trash, and its ring ticks it", () => {
        const resolveRoutine = vi.fn();
        const routine = { ...task, id: "habit-r--2026-09-15", isHabit: true, interactionMode: "task" } as Task;
        renderChip(<CalendarTaskChip task={routine} variant="pill" onSelect={vi.fn()} />, { resolveRoutine });
        fireEvent.click(screen.getByRole("button", { name: `Mark ${routine.title} done` }));
        expect(resolveRoutine).toHaveBeenCalledWith(routine, "COMPLETED");
        fireEvent.contextMenu(screen.getAllByText(routine.title)[0]);
        expect(screen.queryByRole("menuitem", { name: /Trash/ })).toBeNull();
        fireEvent.click(screen.getByRole("menuitem", { name: "Skip" }));
        expect(resolveRoutine).toHaveBeenLastCalledWith(routine, "SKIPPED");
    });
});
