import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import Schedule from "../../../app/routes/schedule";
import * as Popover from "../../../app/components/primitives/Popover";
import { Tooltip } from "../../../app/components/primitives";
import { SETTINGS_DEFAULTS } from "../../../app/types/settings";
import { setUserZone } from "../../../app/lib/utils/user-zone";

const mocks = vi.hoisted(() => ({
    shell: { isPhone: false, isCompact: false, isWide: true, isDesktop: true },
    tasks: [] as Task[], grid: vi.fn(), day: vi.fn(), week: vi.fn(), year: vi.fn(),
    agenda: vi.fn(), month: vi.fn(), strip: vi.fn(), editor: vi.fn(), header: vi.fn(),
    settings: vi.fn(), holidays: vi.fn(), events: vi.fn(),
}));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => mocks.shell }));
vi.mock("../../../app/lib/utils/user-zone", async (original) => ({
    ...await original<typeof import("../../../app/lib/utils/user-zone")>(), useToday: () => "2026-11-02", today: () => "2026-11-02",
}));
vi.mock("../../../app/hooks/ui/use-period-swipe", () => ({ usePeriodSwipe: () => ({ reducedMotion: true, dragProps: {} }) }));
vi.mock("../../../app/hooks/tasks/use-tasks", () => ({ useTasks: () => ({ data: mocks.tasks }) }));
vi.mock("../../../app/hooks/tasks/use-update-task", () => ({ useUpdateTask: () => ({ mutate: vi.fn() }) }));
vi.mock("../../../app/hooks/habits/use-resolve-habit", () => ({ useResolveHabit: () => ({ mutateAsync: vi.fn() }), timeAction: vi.fn() }));
vi.mock("../../../app/hooks/habits/use-virtual-habit-tasks", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../../app/hooks/habits/use-virtual-habit-tasks")>()),
    useVirtualHabitTasks: () => [],
}));
vi.mock("../../../app/hooks/habits/use-habits", () => ({ useHabitsRange: () => ({ data: [] }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: SETTINGS_DEFAULTS }), useUpdateSettings: () => ({ mutate: mocks.settings }),
}));
vi.mock("../../../app/hooks/environment/use-holiday-overlay", () => ({ useHolidayOverlay: () => ({
    enabled: true, holidaysByDate: new Map(), holidayDateSet: new Set(), setEnabled: mocks.holidays,
}) }));
vi.mock("../../../app/hooks/calendar/use-personal-events", () => ({ usePersonalEvents: () => ({
    enabled: true, eventsByDate: new Map(), eventDateSet: new Set(), getEventsForDate: () => [], setEnabled: mocks.events,
}) }));
vi.mock("../../../app/components/layout/MainLayout", () => ({ MainLayout: ({ children, sidePanel }: { children: ReactNode; sidePanel: ReactNode }) => <>{sidePanel}{children}</> }));
vi.mock("../../../app/components/shared/EditSidePanelRail", () => ({ EditSidePanelRail: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../../../app/components/shared/EditSidePanel", () => ({ EditSidePanel: (props: object) => { mocks.editor(props); return <div data-testid="editor" />; } }));
vi.mock("../../../app/components/calendar/ScheduleOverlays", () => ({ ScheduleOverlays: () => null }));
vi.mock("../../../app/components/location/LocationNotice", () => ({ LocationNotice: () => null }));
vi.mock("../../../app/components/calendar/ScheduleHeader", () => ({ ScheduleHeader: ({ overflowContent, ...props }: { overflowContent: ReactNode }) => {
    mocks.header(props); return <Popover.Root><div>{overflowContent}</div></Popover.Root>;
} }));
vi.mock("../../../app/components/calendar/CalendarGrid", () => ({ CalendarGrid: (props: object) => { mocks.grid(props); return <div data-testid="grid" />; } }));
vi.mock("../../../app/components/calendar/DayView", () => ({ DayView: (props: object) => { mocks.day(props); return <div data-testid="day" />; } }));
vi.mock("../../../app/components/calendar/WeekView", () => ({ WeekView: (props: object) => { mocks.week(props); return <div data-testid="week" />; } }));
vi.mock("../../../app/components/calendar/YearView", () => ({ YearView: (props: object) => { mocks.year(props); return <div data-testid="year" />; } }));
vi.mock("../../../app/components/calendar/phone/DayAgenda", () => ({ DayAgenda: (props: object) => { mocks.agenda(props); return <div data-testid="agenda" />; } }));
vi.mock("../../../app/components/calendar/phone/MonthFold", () => ({ MonthFold: (props: object) => { mocks.month(props); return <div data-testid="month" />; } }));
vi.mock("../../../app/components/calendar/phone/DayStrip", () => ({ DayStrip: (props: object) => { mocks.strip(props); return <div data-testid="strip" />; } }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.shell = { isPhone: false, isCompact: false, isWide: true, isDesktop: true };
    mocks.tasks = [];
    setUserZone("America/Toronto");
});
function setup(view: string) {
    return render(<MemoryRouter initialEntries={[`/schedule?view=${view}&date=2026-11-02`]}>
        <Tooltip.Provider><Schedule /></Tooltip.Provider>
    </MemoryRouter>);
}

describe("schedule route composition", () => {
    it.each(["day", "week", "month", "year"])("keeps desktop %s on its existing calendar surface", (view) => {
        setup(view);
        expect(screen.getByTestId(view === "month" ? "grid" : view)).toBeTruthy();
        expect(screen.queryByTestId("agenda")).toBeNull();
    });
    it.each([["day", "agenda"], ["week", "agenda"], ["month", "month"], ["year", "year"]])("routes Phone %s to %s", (view, surface) => {
        mocks.shell = { isPhone: true, isCompact: true, isWide: false, isDesktop: false };
        setup(view);
        expect(screen.getByTestId(surface)).toBeTruthy();
        expect(Boolean(screen.queryByTestId("strip"))).toBe(surface === "agenda");
        expect(screen.getByRole("button", { name: "Add to schedule" })).toBeTruthy();
    });
    it("opens the selected series through the shared editor and toggles it closed", () => {
        mocks.tasks = [{ id: "instance", seriesId: "series", title: "Meeting", state: "ACTIVE", dueDate: "2026-11-02", scheduledStart: null, scheduledEnd: null, endDate: null }] as Task[];
        setup("month");
        act(() => mocks.grid.mock.calls.at(-1)![0].onSelectTask("instance"));
        expect(mocks.editor).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: "series", kind: "task" }));
        act(() => mocks.grid.mock.calls.at(-1)![0].onSelectTask("instance"));
        expect(screen.queryByTestId("editor")).toBeNull();
    });
    it("keeps month-to-day selection connected to navigation", async () => {
        setup("month");
        act(() => mocks.grid.mock.calls.at(-1)![0].onSelectDate("2026-11-03"));
        await waitFor(() => expect(mocks.day).toHaveBeenCalledWith(expect.objectContaining({ currentDate: "2026-11-03" })));
    });
    it("keeps the phone week strip connected to day and week navigation", async () => {
        mocks.shell = { isPhone: true, isCompact: true, isWide: false, isDesktop: false };
        setup("day");
        act(() => mocks.strip.mock.calls.at(-1)![0].onSelect("2026-11-03"));
        await waitFor(() => expect(mocks.agenda).toHaveBeenCalledWith(expect.objectContaining({ dateIso: "2026-11-03" })));
        act(() => mocks.strip.mock.calls.at(-1)![0].onShiftWeek(1));
        await waitFor(() => expect(mocks.agenda).toHaveBeenCalledWith(expect.objectContaining({ dateIso: "2026-11-10" })));
    });
    it("patches desktop clutter controls individually", () => {
        setup("month");
        fireEvent.click(screen.getByRole("switch", { name: "Show fixed blocks" }));
        expect(mocks.settings).toHaveBeenCalledWith({ calendar: { clutter: { showFixed: false } } });
    });
    it("changes both task categories together on phone and keeps the overlay controls separate", () => {
        mocks.shell = { isPhone: true, isCompact: true, isWide: false, isDesktop: false };
        setup("day");
        fireEvent.click(screen.getByRole("switch", { name: "Tasks" }));
        expect(mocks.settings).toHaveBeenCalledWith({ calendar: { clutter: { showAllDay: false, showTimedTasks: false } } });
        fireEvent.click(screen.getByRole("switch", { name: "Holidays" }));
        expect(mocks.holidays).toHaveBeenCalledWith(false);
        mocks.holidays.mockClear();
        fireEvent.click(screen.getByText("Holidays"));
        expect(mocks.holidays).toHaveBeenCalledWith(false);
        expect(mocks.events).not.toHaveBeenCalled();
    });
});
