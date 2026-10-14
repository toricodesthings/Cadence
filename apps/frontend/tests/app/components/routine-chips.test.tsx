import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { RoutineBadge, RoutineRow, RoutineStrip } from "../../../app/components/calendar/RoutineChips";
import { CalendarChipActionsContext, CalendarHoverContext } from "../../../app/components/calendar/CalendarItem";
import { Provider } from "../../../app/components/primitives/Tooltip";
import type { TimedPointLayout } from "../../../app/lib/utils/calendar/calendar-utils";

vi.mock("../../../app/hooks/tasks/use-archive-task", () => ({
    useArchiveTask: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/sections/use-sections", () => ({ useAllSections: () => [] }));
vi.mock("../../../app/components/tasks/TaskCheckbox", () => ({
    TaskCheckbox: () => <button aria-label="Mark complete" />,
}));
const routine = (id: string, state: "ACTIVE" | "COMPLETE" = "ACTIVE") =>
    ({
        id: `habit-${id}--2026-10-14`,
        title: id,
        state,
        isHabit: true,
        priority: 0,
        scheduledStart: null,
    }) as Task;
const layout = (points: [Task, ...Task[]], marker: "row" | "badge" = "badge"): TimedPointLayout => ({
    task: points[0],
    points,
    marker,
    top: 100,
    height: 24,
    column: 0,
    columns: 1,
});
const wrap = (ui: React.ReactNode, resolveRoutine = vi.fn(), series: string | null = null) => (
    <Provider>
        <CalendarChipActionsContext.Provider value={{ resolveRoutine }}>
            <CalendarHoverContext.Provider value={{ series, setSeries: vi.fn() }}>{ui}</CalendarHoverContext.Provider>
        </CalendarChipActionsContext.Provider>
    </Provider>
);

beforeEach(() => vi.clearAllMocks());
describe("routine calendar interactions", () => {
    it("keeps badge check-off separate from its visible in-place details action and menu", () => {
        const task = routine("Medication"),
            select = vi.fn(),
            resolve = vi.fn();
        render(wrap(<RoutineBadge layout={layout([task])} onSelect={select} tipSide="right" />, resolve));
        fireEvent.click(screen.getByRole("button", { name: "Mark Medication done" }));
        expect(resolve).toHaveBeenCalledWith(task, "COMPLETED");
        expect(select).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Open details for Medication" }));
        expect(select).toHaveBeenCalledWith(task.id);
        fireEvent.contextMenu(screen.getByRole("button", { name: "Mark Medication done" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Open details" }));
        expect(select).toHaveBeenCalledTimes(2);
    });
    it("lets either member of a shared row open its own details", () => {
        const a = routine("Stretch"),
            b = routine("Workout"),
            select = vi.fn();
        render(wrap(<RoutineRow layout={layout([a, b], "row")} onSelect={select} tipSide="right" />));
        fireEvent.click(screen.getByRole("button", { name: "Open details for Workout" }));
        expect(select).toHaveBeenCalledWith(b.id);
        fireEvent.click(screen.getByRole("button", { name: "Open details for Stretch" }));
        expect(select).toHaveBeenLastCalledWith(a.id);
    });
    it("exposes every grouped badge member through the same routine list", () => {
        const a = routine("Stretch"),
            b = routine("Workout"),
            select = vi.fn();
        render(wrap(<RoutineBadge layout={layout([a, b])} onSelect={select} tipSide="right" />));
        fireEvent.click(screen.getByRole("button", { name: "2 routines: Stretch, Workout" }));
        fireEvent.click(screen.getByRole("button", { name: "Workout" }));
        expect(select).toHaveBeenCalledWith(b.id);
    });
    it("dims completed badge/strip marks and applies series dimming without compounding below half opacity", () => {
        const done = routine("done", "COMPLETE"),
            other = routine("other");
        const { container } = render(
            wrap(
                <>
                    <RoutineBadge layout={layout([done])} onSelect={vi.fn()} tipSide="right" />
                    <RoutineStrip tasks={[done, other]} onSelect={vi.fn()} />
                </>,
                vi.fn(),
                "done",
            ),
        );
        const items = [...container.querySelectorAll<HTMLElement>("[data-task-chip]")];
        expect(items.map((item) => item.style.opacity)).toEqual(["0.5", "0.5", "0.6"]);
        expect(items[0].className).toContain("ring-1");
        expect(items[1].className).toContain("ring-1");
        expect(items[2].className).not.toContain("ring-1");
    });
    it("measures after empty → loaded and again after loaded → empty → loaded", () => {
        const observe = vi.fn(),
            disconnect = vi.fn();
        const callbacks: ResizeObserverCallback[] = [];
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(callback: ResizeObserverCallback) {
                    callbacks.push(callback);
                }
                observe = observe;
                disconnect = disconnect;
                unobserve() {}
            },
        );
        const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(84);
        const tasks = [routine("French"), routine("Read"), routine("Journal")],
            select = vi.fn();
        const { rerender } = render(wrap(<RoutineStrip tasks={[]} onSelect={select} />));
        expect(observe).not.toHaveBeenCalled();
        rerender(wrap(<RoutineStrip tasks={tasks} onSelect={select} />));
        expect(observe).toHaveBeenCalledTimes(1);
        expect(screen.getAllByRole("button", { name: /^Mark .* done$/ })).toHaveLength(2);
        expect(screen.getByRole("button", { name: "1 more routines · Open routine details" })).toBeTruthy();
        width.mockReturnValue(56);
        act(() => callbacks[0]([], {} as ResizeObserver));
        expect(screen.getAllByRole("button", { name: /^Mark .* done$/ })).toHaveLength(1);
        rerender(wrap(<RoutineStrip tasks={[]} onSelect={select} />));
        expect(disconnect).toHaveBeenCalledTimes(1);
        rerender(wrap(<RoutineStrip tasks={tasks} onSelect={select} />));
        expect(observe).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByRole("button", { name: "2 more routines · Open routine details" }));
        fireEvent.click(screen.getByRole("button", { name: "Journal" }));
        expect(select).toHaveBeenCalledWith(tasks[2].id);
    });
});
