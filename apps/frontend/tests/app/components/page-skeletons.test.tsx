import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoutinesMonthSkeleton, RoutinesWeekSkeleton } from "../../../app/components/habits/RoutinesSkeleton";
import { EventsSkeleton } from "../../../app/components/events/EventsSkeleton";
import {
    ScheduleDaySkeleton,
    ScheduleMonthSkeleton,
    ScheduleWeekSkeleton,
    ScheduleYearSkeleton,
} from "../../../app/components/calendar/ScheduleSkeleton";
import {
    HabitReviewSkeleton,
    ReviewCardsSkeleton,
    WeekRoomSkeleton,
} from "../../../app/components/weekly-review/WeeklyReviewSkeleton";
import { BoardSkeleton, TaskListSkeleton } from "../../../app/components/tasks/TaskListSkeleton";
import {
    AssistantPanelSkeleton,
    DetailPanelSkeleton,
    TaskNoteSkeleton,
} from "../../../app/components/shared/DetailPanelSkeleton";
import type { RoutineDay } from "../../../app/components/habits/RoutineWeekRow";

const WEEK_DAYS: RoutineDay[] = [
    { iso: "2026-11-22", short: "Sun", initial: "S", dayNum: 22 },
    { iso: "2026-11-23", short: "Mon", initial: "M", dayNum: 23 },
    { iso: "2026-11-24", short: "Tue", initial: "T", dayNum: 24 },
    { iso: "2026-11-25", short: "Wed", initial: "W", dayNum: 25 },
    { iso: "2026-11-26", short: "Thu", initial: "T", dayNum: 26 },
    { iso: "2026-11-27", short: "Fri", initial: "F", dayNum: 27 },
    { iso: "2026-11-28", short: "Sat", initial: "S", dayNum: 28 },
];

describe("main page layout skeletons", () => {
    it("renders Routines week (desktop & phone) and month skeletons", () => {
        const { container, rerender } = render(
            <RoutinesWeekSkeleton
                days={WEEK_DAYS}
                today="2026-11-26"
                stacked={false}
                showWeekCount
                showTodayBand={false}
            />,
        );
        expect(screen.getByRole("status", { name: "Loading routines" })).toBeTruthy();
        expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(20);
        expect(screen.getByText("This week")).toBeTruthy();

        rerender(
            <RoutinesWeekSkeleton days={WEEK_DAYS} today="2026-11-26" stacked showWeekCount={false} showTodayBand />,
        );
        expect(screen.getByRole("status", { name: "Loading routines" })).toBeTruthy();

        rerender(<RoutinesMonthSkeleton showTodayBand />);
        expect(screen.getByRole("status", { name: "Loading routines" })).toBeTruthy();
    });

    it("renders Events cards and list skeletons", () => {
        const { container, rerender } = render(<EventsSkeleton view="cards" stacked={false} />);
        expect(screen.getByRole("status", { name: "Loading events" })).toBeTruthy();
        expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(10);

        rerender(<EventsSkeleton view="list" stacked={false} />);
        expect(screen.getByText("Countdown")).toBeTruthy();

        rerender(<EventsSkeleton view="list" stacked />);
        expect(screen.getByRole("status", { name: "Loading events" })).toBeTruthy();
    });

    it("renders Schedule month, week, day and year skeletons", () => {
        const { container, rerender } = render(<ScheduleMonthSkeleton year={2026} month={10} phone={false} />);
        expect(screen.getByRole("status", { name: "Loading schedule" })).toBeTruthy();
        expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(5);

        rerender(<ScheduleMonthSkeleton year={2026} month={10} phone />);
        expect(screen.getByRole("status", { name: "Loading schedule" })).toBeTruthy();

        rerender(<ScheduleWeekSkeleton weekDates={WEEK_DAYS.map((d) => d.iso)} />);
        expect(screen.getByRole("status", { name: "Loading week schedule" })).toBeTruthy();

        rerender(<ScheduleDaySkeleton phone={false} />);
        expect(screen.getByRole("status", { name: "Loading day schedule" })).toBeTruthy();

        rerender(<ScheduleDaySkeleton phone />);
        expect(screen.getByRole("status", { name: "Loading day schedule" })).toBeTruthy();

        rerender(<ScheduleYearSkeleton compact={false} />);
        expect(screen.getByRole("status", { name: "Loading year schedule" })).toBeTruthy();
    });

    it("renders Weekly Reset and task list/board skeletons", () => {
        const { rerender } = render(<ReviewCardsSkeleton label="Loading thoughts" />);
        expect(screen.getByRole("status", { name: "Loading thoughts" })).toBeTruthy();

        rerender(<HabitReviewSkeleton />);
        expect(screen.getByRole("status", { name: "Loading routines" })).toBeTruthy();

        rerender(<WeekRoomSkeleton />);
        expect(screen.getByRole("status", { name: "Loading week overview" })).toBeTruthy();

        rerender(<TaskListSkeleton />);
        expect(screen.getByRole("status", { name: "Loading tasks" })).toBeTruthy();

        rerender(<BoardSkeleton columns={3} />);
        expect(screen.getByRole("status", { name: "Loading board" })).toBeTruthy();
    });

    it("renders Task detail panel, note, and Assistant panel skeletons", () => {
        const { container, rerender } = render(<DetailPanelSkeleton kind="task" />);
        expect(screen.getByRole("status", { name: "Loading task details" })).toBeTruthy();
        expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(10);

        rerender(<DetailPanelSkeleton kind="habit" />);
        expect(screen.getByRole("status", { name: "Loading habit details" })).toBeTruthy();

        rerender(<TaskNoteSkeleton />);
        expect(screen.getByRole("status", { name: "Loading notes" })).toBeTruthy();

        rerender(<AssistantPanelSkeleton width={360} />);
        expect(screen.getByRole("status", { name: "Loading assistant" })).toBeTruthy();
    });
});
