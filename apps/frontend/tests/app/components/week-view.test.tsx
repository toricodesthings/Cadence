import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeekView } from "../../../app/components/calendar/WeekView";

vi.mock("../../../app/components/calendar/TimeGutter", () => ({
    TimeGutter: () => <div data-testid="time-gutter" />,
}));

vi.mock("../../../app/components/calendar/CalendarTaskChip", () => ({
    CalendarTaskChip: () => <div data-testid="calendar-task-chip" />,
}));

vi.mock("../../../app/components/calendar/CalendarDropTargets", () => ({
    AllDayDropLane: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AllDayDropPreview: () => <div data-testid="allday-drop-preview" />,
    TimeSlotDropLayer: () => <div data-testid="timeslot-drop-layer" />,
    TimedDropPreview: () => <div data-testid="timed-drop-preview" />,
}));

describe("WeekView", () => {
    it("renders weekday headers from the provided weekDates order", () => {
        render(
            <WeekView
                weekDates={[
                    new Date("2026-03-15T00:00:00"),
                    new Date("2026-03-16T00:00:00"),
                    new Date("2026-03-17T00:00:00"),
                    new Date("2026-03-18T00:00:00"),
                    new Date("2026-03-19T00:00:00"),
                    new Date("2026-03-20T00:00:00"),
                    new Date("2026-03-21T00:00:00"),
                ]}
                tasksByDate={{}}
                onSelectTask={() => {}}
                onCompleteTask={() => {}}
                onArchiveTask={() => {}}
            />,
        );

        const dayHeaders = screen.getAllByText(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/).slice(0, 7);
        expect(dayHeaders.map((node) => node.textContent)).toEqual([
            "Sun",
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
        ]);
    });
});