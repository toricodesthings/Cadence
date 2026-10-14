import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import {
    CalendarItem,
    useCalendarItemPresentation,
    CalendarHoverContext,
} from "../../../app/components/calendar/CalendarItem";
import { Provider } from "../../../app/components/primitives/Tooltip";

vi.mock("../../../app/hooks/tasks/use-archive-task", () => ({
    useArchiveTask: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../app/hooks/projects/use-projects", () => ({
    useProjects: () => ({ data: [{ id: "list", name: "University" }] }),
}));
vi.mock("../../../app/hooks/sections/use-sections", () => ({
    useAllSections: () => [{ id: "section", name: "COMP3000" }],
}));
const task = {
    id: "habit-r--2026-10-14",
    title: "Medication",
    isHabit: true,
    state: "ACTIVE",
    recurrenceRule: "FREQ=DAILY",
    projectId: "list",
    sectionId: "section",
    scheduledStart: null,
} as Task;
const trigger = <button type="button">Preview</button>;

function Presentation({ task }: { task: Task }) {
    const presentation = useCalendarItemPresentation([task]);
    return <div data-testid={task.title} style={presentation.style} />;
}
describe("shared calendar presentation", () => {
    it("shows a routine's cadence and List › Section on keyboard focus", async () => {
        render(
            <Provider>
                <CalendarItem task={task} onSelect={vi.fn()}>
                    {trigger}
                </CalendarItem>
            </Provider>,
        );
        act(() => screen.getByRole("button", { name: "Preview" }).focus());
        await waitFor(() => expect(screen.getAllByText("Repeats daily").length).toBeGreaterThan(0));
        expect(screen.getAllByText("University › COMP3000").length).toBeGreaterThan(0);
    });
    it("suppresses hover details while dragging", async () => {
        const ui = (dragging: boolean) => (
            <Provider>
                <CalendarItem task={task} onSelect={vi.fn()} dragging={dragging}>
                    {trigger}
                </CalendarItem>
            </Provider>
        );
        const { rerender } = render(ui(false));
        const before = screen.getByRole("button", { name: "Preview" });
        rerender(ui(true));
        expect(screen.getByRole("button", { name: "Preview" })).toBe(before);
        act(() => screen.getByRole("button", { name: "Preview" }).focus());
        expect(screen.queryByText("Repeats daily")).toBeNull();
        expect(screen.queryByRole("tooltip")).toBeNull();
    });
    it("fades past Fixed/routine items, keeps an owed task bright, and caps combined dimming at half", () => {
        const past = { ...task, scheduledStart: "2020-01-01T10:00:00Z", scheduledEnd: "2020-01-01T11:00:00Z" };
        const items = [
            past,
            { ...past, id: "fixed", title: "Fixed", isHabit: false, interactionMode: "timetable" },
            { ...past, id: "owed", title: "Owed", isHabit: false, interactionMode: "task" },
        ] as Task[];
        const ui = (series: string | null) => (
            <CalendarHoverContext.Provider value={{ series, setSeries: vi.fn() }}>
                {items.map((item) => (
                    <Presentation key={item.id} task={item} />
                ))}
            </CalendarHoverContext.Provider>
        );
        const { rerender } = render(ui(null));
        expect(screen.getByTestId("Medication").style.opacity).toBe("0.7");
        expect(screen.getByTestId("Fixed").style.opacity).toBe("0.7");
        expect(screen.getByTestId("Owed").style.opacity).toBe("1");
        rerender(ui("other"));
        expect(screen.getByTestId("Medication").style.opacity).toBe("0.5");
        expect(screen.getByTestId("Fixed").style.opacity).toBe("0.5");
        expect(screen.getByTestId("Owed").style.opacity).toBe("0.6");
    });
});
