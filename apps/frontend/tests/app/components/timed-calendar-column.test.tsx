import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Provider } from "../../../app/components/primitives/Tooltip";
import { DayView } from "../../../app/components/calendar/DayView";
import { WeekView } from "../../../app/components/calendar/WeekView";

vi.mock("../../../app/components/calendar/CalendarDropTargets", () => ({
    AllDayDropLane: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    AllDayDropPreview: () => null,
    TimeSlotDropLayer: () => null,
    TimedDropPreview: () => null,
}));
vi.mock("../../../app/lib/api/track-event", () => ({ trackUsageEvent: vi.fn() }));
vi.mock("../../../app/components/calendar/CurrentTimeIndicator", () => ({ CurrentTimeIndicator: () => null }));
const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
describe("Day and Week creation menus", () => {
    it.each(["day", "week"])("carries the Event tab and clicked day from %s's context action", (view) => {
        const create = vi.fn();
        const { container } = render(
            <Provider>
                {view === "day" ? (
                    <DayView currentDate={week[0]} tasks={[]} onSelectTask={vi.fn()} onGridClick={create} />
                ) : (
                    <WeekView weekDates={week} tasksByDate={{}} onSelectTask={vi.fn()} onGridClick={create} />
                )}
            </Provider>,
        );
        const column = container.querySelector(`[data-calendar-column="${week[0]}"]`)!;
        fireEvent.contextMenu(column, { clientY: 180 });
        fireEvent.click(screen.getByRole("menuitem", { name: "Add event here" }));
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({ date: week[0], tab: "event", startHour: 2, startMinute: 30 }),
        );
        fireEvent.click(column, { clientY: 180 });
        expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ date: week[0], tab: "task" }));
    });
});
