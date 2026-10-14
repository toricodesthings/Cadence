import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { WeekView } from "../../../app/components/calendar/WeekView";
import { ScheduleHeader } from "../../../app/components/calendar/ScheduleHeader";
import { getWeekDays, setDateFormatConfig } from "../../../app/lib/utils/date-format";

vi.mock("../../../app/components/calendar/TimeGutter", () => ({
    TimeGutter: () => <div data-testid="time-gutter" />,
}));

vi.mock("../../../app/hooks/tasks/use-archive-task", () => ({ useArchiveTask: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/sections/use-sections", () => ({ useAllSections: () => [] }));
vi.mock("../../../app/components/tasks/TaskCheckbox", () => ({
    TaskCheckbox: () => <button type="button" aria-label="Mark complete" />,
}));

vi.mock("../../../app/components/calendar/CalendarDropTargets", () => ({
    AllDayDropLane: ({ children }: { children?: React.ReactNode }) => <div data-testid="lane">{children}</div>,
    AllDayDropPreview: () => <div data-testid="allday-drop-preview" />,
    TimeSlotDropLayer: () => <div data-testid="timeslot-drop-layer" />,
    TimedDropPreview: () => <div data-testid="timed-drop-preview" />,
}));

const SUNDAY_WEEK = ["2026-03-15", "2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20", "2026-03-21"];

const renderWeek = (tasksByDate: Record<string, Task[]>) => render(
    <TooltipProvider>
        <WeekView weekDates={SUNDAY_WEEK} tasksByDate={tasksByDate} onSelectTask={() => {}} />
    </TooltipProvider>,
);

describe("WeekView", () => {
    it.each([0, 1] as const)("keeps the real header and grid on the same week with week start %s", (weekStartsOn) => {
        setDateFormatConfig({ timeDisplay: "12h", dateStyle: "mdy", weekStartsOn });
        const dates = getWeekDays("2026-03-18", weekStartsOn);
        const { container } = render(<TooltipProvider>
            <ScheduleHeader year={2026} month={2} currentDate="2026-03-18" viewMode="week" weekStartsOn={weekStartsOn}
                isCurrentPeriod={false} onViewMode={vi.fn()} onNavigate={vi.fn()} onToday={vi.fn()} />
            <WeekView weekDates={dates} tasksByDate={{}} onSelectTask={vi.fn()} />
        </TooltipProvider>);
        expect(screen.getByText(weekStartsOn === 0 ? "Mar 15 – 21" : "Mar 16 – 22")).toBeTruthy();
        expect(container.querySelector("[data-calendar-column]")?.getAttribute("data-calendar-column")).toBe(dates[0]);
    });
    it("renders weekday headers from the provided weekDates order", () => {
        renderWeek({});
        const dayHeaders = screen.getAllByText(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/).slice(0, 7);
        expect(dayHeaders.map((node) => node.textContent)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    });

    it("folds anytime routines into one strip of marks, not pills", () => {
        const routine = (id: string, title: string) => ({ id: `habit-${id}--2026-03-16`, title, isHabit: true, state: "ACTIVE", dueDate: "2026-03-16", endDate: null, scheduledStart: null, scheduledEnd: null }) as unknown as Task;
        renderWeek({ "2026-03-16": [routine("a", "French"), routine("b", "Read"), routine("c", "Journal")] });
        expect(screen.getAllByRole("button", { name: /^Mark .* done$/ })).toHaveLength(3);
        expect(document.querySelectorAll("[data-task-chip]")).toHaveLength(3);
    });

    it("draws a multi-day task as one bar across its days", () => {
        const prep = { id: "t1", title: "Reading week prep", state: "ACTIVE", priority: 0, dueDate: "2026-03-19", endDate: "2026-03-21", scheduledStart: null, scheduledEnd: null } as unknown as Task;
        renderWeek({ "2026-03-19": [prep], "2026-03-20": [prep], "2026-03-21": [prep] });
        const bars = screen.getAllByText("Reading week prep");
        expect(bars).toHaveLength(1);
        const cell = within(bars[0].closest("[style*='grid-column']") as HTMLElement);
        expect(cell.getByText("Reading week prep")).toBeTruthy();
        expect((bars[0].closest("[style*='grid-column']") as HTMLElement).style.gridColumn).toBe("5 / 8");
    });
});
