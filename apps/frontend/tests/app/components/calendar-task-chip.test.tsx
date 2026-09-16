import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { CalendarTaskChip } from "../../../app/components/calendar/CalendarTaskChip";

const { archive } = vi.hoisted(() => ({ archive: vi.fn() }));
vi.mock("../../../app/hooks/tasks/use-archive-task", () => ({
    useArchiveTask: () => ({ mutate: archive, isPending: false }),
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

describe("CalendarTaskChip Trash menu", () => {
    beforeEach(() => archive.mockClear());
    it.each(["pill", "block"] as const)("trashes the series from a %s without opening the cell menu", (variant) => {
        const cellMenu = vi.fn();
        const select = vi.fn();
        render(
            <div onContextMenu={cellMenu}>
                <CalendarTaskChip task={task} variant={variant} onSelect={select} />
            </div>,
        );
        fireEvent.contextMenu(screen.getByText(task.title));
        expect(cellMenu).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("menuitem", { name: "Move series to Trash" }));
        expect(archive).toHaveBeenCalledWith("series-1");
        expect(select).not.toHaveBeenCalled();
    });

    it("targets the task itself for a non-recurring task", () => {
        render(<CalendarTaskChip task={{ ...task, id: "task-1", seriesId: undefined, recurrenceRule: null, isRecurringInstance: false, interactionMode: "task" }} variant="pill" onSelect={vi.fn()} />);
        fireEvent.contextMenu(screen.getByText(task.title));
        fireEvent.click(screen.getByRole("menuitem", { name: "Move to Trash" }));
        expect(archive).toHaveBeenCalledWith("task-1");
    });

    it("does not offer task deletion for virtual habits", () => {
        render(<CalendarTaskChip task={{ ...task, isHabit: true }} variant="pill" onSelect={vi.fn()} />);
        fireEvent.contextMenu(screen.getByText(task.title));
        expect(screen.queryByRole("menuitem")).toBeNull();
    });
});
