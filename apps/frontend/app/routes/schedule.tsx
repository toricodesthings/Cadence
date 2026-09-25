import { useTaskDetailsRequest } from "../hooks/ui/use-task-details-request";
import { slideVariants, type SlideCustom } from "../lib/constants/motion";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Switch } from "../components/primitives/Switch";
import { Tip } from "../components/primitives";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    pointerWithin,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
    type DragCancelEvent,
} from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarGrid } from "../components/calendar/CalendarGrid";
import { WeekView } from "../components/calendar/WeekView";
import { DayView } from "../components/calendar/DayView";
import { DayAgenda } from "../components/calendar/phone/DayAgenda";
import { DayStrip } from "../components/calendar/phone/DayStrip";
import { MonthFold } from "../components/calendar/phone/MonthFold";
import { LightenTodaySheet, ReadyToPlaceSheet } from "../components/calendar/phone/ScheduleSheets";
import { PlaceSheet, dayLabel } from "../components/holding/PlaceSheet";
import { YearView } from "../components/calendar/YearView";
import { ScheduleHeader, type CalendarViewMode } from "../components/calendar/ScheduleHeader";
import { CalendarTaskChipOverlay } from "../components/calendar/CalendarTaskChip";
import { CalendarEventPopover, type CalendarEventInfo } from "../components/calendar/CalendarEventPopover";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { useTasks } from "../hooks/tasks/use-tasks";
import { useUpdateTask } from "../hooks/tasks/use-update-task";
import {
    toISODate,
    getMonthDateRange,
    getWeekDates,
    getWeekDateRange,
    getYearDateRange,
    formatTime,
    parseLocalDate,
    preserveLocalTime,
    getEffectiveTaskDate,
    parseEffectiveTaskDate,
    MONTH_NAMES,
} from "../lib/utils/date-format";
import type { Task } from "@cadence/contracts/task";
import { useVirtualHabitTasks } from "../hooks/habits/use-virtual-habit-tasks";
import { useResolveHabit } from "../hooks/habits/use-resolve-habit";
import { toast } from "sonner";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { usePeriodSwipe } from "../hooks/ui/use-period-swipe";
import {
    getDateFromTimedDropId,
    parseCalendarTimedDropId,
    type CalendarDropPreview,
} from "../lib/utils/calendar/calendar-dnd";
import { getTaskSeriesId, isPassiveTimetableTask, isRecurringTask, isRecurringTaskInstance } from "../lib/utils/task/task-scheduling";
import { dayLoad, groupByDate, scheduleKind } from "../lib/utils/calendar/schedule-day";
import { loadWord } from "../lib/utils/task/day-load";
import { useHabitsRange } from "../hooks/habits/use-habits";
import { useTaskCompletionStore } from "../stores/task-completion-store";
import { format } from "date-fns";
import { MouseSensor, TouchSensor } from "../lib/utils/dnd";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { LocationNotice } from "../components/location/LocationNotice";
import { CalendarCheck, Feather, Plus, Wrench } from "lucide-react";
import * as Popover from "../components/primitives/Popover";
import { useHolidayOverlay } from "../hooks/environment/use-holiday-overlay";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import { useSettings, useUpdateSettings } from "../hooks/core/use-settings";
import { parseYMD, addDaysToIso, addMonthsToIso, getTaskDurationMs } from "../lib/utils/calendar/calendar-math";
import { trackUsageEvent } from "../lib/api/track-event";

function applyCalendarClutterFilters(tasks: Task[], clutter: {
    showAllDay?: boolean;
    showTimedTasks?: boolean;
    showHabitAnchors?: boolean;
    showFixed?: boolean;
}) {
    return tasks.filter((task) => {
        if (task.isHabit && clutter.showHabitAnchors === false) return false;
        if (!task.isHabit && isPassiveTimetableTask(task) && clutter.showFixed === false) return false;
        if (!task.isHabit && task.isAllDay && clutter.showAllDay === false) return false;
        if (!task.isHabit && !task.isAllDay && clutter.showTimedTasks === false) return false;
        return true;
    });
}

function isValidDateParam(value: string | null): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime()) && toISODate(parsed) === value;
}

function isCalendarViewModeValue(value: string | null): value is CalendarViewMode {
    return value === "day" || value === "week" || value === "month" || value === "year";
}

// ── component ──────────────────────────────────────────────────────────────

export default function Schedule() {
    const shell = useShellMode();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const today = new Date();

    // ── Persisted view mode per device class ────────────────────────────────
    const deviceClass = shell.isPhone ? "phone" : shell.isDesktop ? "desktop" : "tablet";
    const storageKey = `cadence-schedule-view-${deviceClass}`;
    const defaultView: CalendarViewMode = shell.isPhone ? "day" : shell.isDesktop ? "month" : "week";
    const [storedViewMode, setViewModeRaw] = useState<CalendarViewMode>(() => {
        const queryView = searchParams.get("view");
        if (isCalendarViewModeValue(queryView)) return queryView;
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored === "day" || stored === "week" || stored === "month" || stored === "year") return stored;
        } catch { /* noop */ }
        return defaultView;
    });
    // Phones zoom Day → Month → Year; Week's strip lives inside Day there.
    const viewMode: CalendarViewMode = shell.isPhone && storedViewMode === "week" ? "day" : storedViewMode;
    const isPhoneDay = shell.isPhone && viewMode === "day";
    const setViewMode = useCallback((mode: CalendarViewMode) => {
        setViewModeRaw(mode);
        try { localStorage.setItem(storageKey, mode); } catch { /* noop */ }
    }, [storageKey]);

    const [currentDate, setCurrentDate] = useState<string>(() => {
        const queryDate = searchParams.get("date");
        return isValidDateParam(queryDate) ? queryDate : toISODate(today);
    });
    const [direction, setDirection] = useState(0);
    /** 1 = zooming in (Year → Month → Day), -1 = out; phones only. */
    const [zoom, setZoom] = useState(0);
    const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
    const [placeTask, setPlaceTask] = useState<Task | null>(null);
    const [readyOpen, setReadyOpen] = useState(false);
    const [lightenOpen, setLightenOpen] = useState(false);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");

    useTaskDetailsRequest((taskId) => {
        setSelectedTaskId(taskId);
        setMobileDetailMode("peek");
    });

    const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
    const [activeDropId, setActiveDropId] = useState<string | null>(null);
    const [eventPopoverInfo, setEventPopoverInfo] = useState<CalendarEventInfo | null>(null);
    const [eventPopoverTab, setEventPopoverTab] = useState<"task" | "event">("task");
    const [draftPlacement, setDraftPlacement] = useState<{ dateStr: string; startMinute: number; endMinute: number } | null>(null);

    useEffect(() => {
        const queryDate = searchParams.get("date");
        if (isValidDateParam(queryDate) && queryDate !== currentDate) {
            setCurrentDate(queryDate);
        }
    }, [searchParams]);

    useEffect(() => {
        const queryView = searchParams.get("view");
        if (isCalendarViewModeValue(queryView) && queryView !== viewMode) {
            setViewMode(queryView);
        }
    }, [searchParams, setViewMode]);

    useDocumentMeta(
        "Schedule · Cadence",
        "View your week, day, month, and year with a calmer scheduling workspace built for focus.",
    );

    const { mutate: updateTask } = useUpdateTask();
    const resolveHabitMutation = useResolveHabit();
    const resolveHabit = resolveHabitMutation.mutate;
    const queueCompletion = useTaskCompletionStore((state) => state.queueCompletion);

    // ── Derived values ─────────────────────────────────────────────────────
    const { y: year, m: month } = parseYMD(currentDate);

    // ── Data fetching per view (only fetch for the active view) ────────────
    const monthRange = getMonthDateRange(year, month);
    const { data: monthTasks = [] } = useTasks({
        state: "ACTIVE",
        scheduledRange: monthRange,
        enabled: viewMode === "month",
    });

    const weekDates = useMemo(() => getWeekDates(new Date(currentDate + "T00:00:00")), [currentDate]);
    const weekRange = useMemo(() => getWeekDateRange(new Date(currentDate + "T00:00:00")), [currentDate]);
    const { data: weekTasks = [] } = useTasks({
        state: "ACTIVE",
        scheduledRange: weekRange,
        enabled: viewMode === "week" || isPhoneDay,
    });

    // Date-only bounds, same shape as week/month/year ranges, so the optimistic
    // cache matcher (cache-sync.ts) compares like with like.
    const dayRange = useMemo(() => ({ start: currentDate, end: currentDate }), [currentDate]);
    const { data: dayTasks = [] } = useTasks({
        state: "ACTIVE",
        scheduledRange: dayRange,
        enabled: viewMode === "day" && !shell.isPhone,
    });

    const yearRange = getYearDateRange(year);
    const { data: yearTasks = [] } = useTasks({
        state: "ACTIVE",
        scheduledRange: yearRange,
        enabled: viewMode === "year",
    });

    const holidayQueryRange = useMemo(() => {
        if (viewMode === "year") {
            return {
                start: yearRange.start.substring(0, 10),
                end: yearRange.end.substring(0, 10),
            };
        }

        if (viewMode === "week" || isPhoneDay) {
            return {
                start: weekRange.start.substring(0, 10),
                end: weekRange.end.substring(0, 10),
            };
        }

        if (viewMode === "day") {
            return {
                start: currentDate,
                end: currentDate,
            };
        }

        return {
            start: monthRange.start.substring(0, 10),
            end: monthRange.end.substring(0, 10),
        };
    }, [currentDate, isPhoneDay, monthRange.end, monthRange.start, viewMode, weekRange.end, weekRange.start, yearRange.end, yearRange.start]);

    const holidayOverlay = useHolidayOverlay({
        start: holidayQueryRange.start,
        end: holidayQueryRange.end,
        viewMode,
    });

    // ── Birthday overlay ───────────────────────────────────────────────────
    const { data: userSettings } = useSettings();
    const updateSettings = useUpdateSettings();
    const calendarClutter = userSettings?.calendar?.clutter ?? {
        showAllDay: true,
        showTimedTasks: true,
        showHabitAnchors: true,
        showFixed: true,
    };
    const birthdayDate = useMemo(() => {
        const bd = userSettings?.profile?.birthday;
        if (!bd) return null;
        // bd is "YYYY-MM-DD" — extract month+day, apply to current view year
        const parts = bd.split("-");
        if (parts.length < 3) return null;
        const mm = parts[1];
        const dd = parts[2];
        return `${year}-${mm}-${dd}`;
    }, [userSettings?.profile?.birthday, year]);

    const birthdayDay = useMemo(() => {
        if (!birthdayDate) return null;
        const parts = birthdayDate.split("-");
        const bMonth = parseInt(parts[1]) - 1;
        const bDay = parseInt(parts[2]);
        return bMonth === month ? bDay : null;
    }, [birthdayDate, month]);

    // ── Personal events overlay ────────────────────────────────────────────
    const personalEvents = usePersonalEvents(year, month);

    const personalEventsByDateRecord = useMemo<Record<string, import("../types/settings").PersonalEvent[]>>(() => {
        return Object.fromEntries(personalEvents.eventsByDate.entries());
    }, [personalEvents.eventsByDate]);

    const personalEventCountsByDay = useMemo<Record<number, number>>(() => {
        if (!personalEvents.enabled) return {};

        const counts: Record<number, number> = {};
        const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
        for (const [dateStr, events] of personalEvents.eventsByDate.entries()) {
            if (!dateStr.startsWith(monthPrefix)) continue;
            counts[Number.parseInt(dateStr.slice(-2), 10)] = events.length;
        }
        return counts;
    }, [month, personalEvents.enabled, personalEvents.eventsByDate, year]);

    const personalEventDateCounts = useMemo<Record<string, number>>(() => {
        return Object.fromEntries(
            Array.from(personalEvents.eventsByDate.entries()).map(([dateStr, events]) => [dateStr, events.length]),
        );
    }, [personalEvents.eventsByDate]);

    // ── Habits injection ───────────────────────────────────────────────────
    const habitRange = useMemo(() => {
        if (viewMode === "year") return { start: "", end: "", enabled: false };
        const ranges = { month: monthRange, week: weekRange, day: dayRange };
        const r = ranges[(isPhoneDay ? "week" : viewMode) as keyof typeof ranges];
        return {
            start: typeof r.start === "string" ? r.start.substring(0, 10) : "",
            end: typeof r.end === "string" ? r.end.substring(0, 10) : "",
            enabled: true,
        };
    }, [viewMode, isPhoneDay, monthRange, weekRange, dayRange]);

    const virtualHabitTasks = useVirtualHabitTasks(habitRange);
    // Same query as the virtual tasks (cached): the real routines, for their editor and emoji.
    const { data: rawHabits = [] } = useHabitsRange(habitRange);
    const habitById = useMemo(() => new Map(rawHabits.map((habit) => [habit.id, habit])), [rawHabits]);
    const visibleMonthTasks = useMemo(() => applyCalendarClutterFilters(monthTasks, calendarClutter), [calendarClutter, monthTasks]);
    const visibleWeekTasks = useMemo(() => applyCalendarClutterFilters(weekTasks, calendarClutter), [calendarClutter, weekTasks]);
    const visibleDayTasks = useMemo(() => applyCalendarClutterFilters(dayTasks, calendarClutter), [calendarClutter, dayTasks]);
    const visibleYearTasks = useMemo(() => applyCalendarClutterFilters(yearTasks, calendarClutter), [calendarClutter, yearTasks]);
    const visibleHabitTasks = useMemo(() => (
        calendarClutter.showHabitAnchors === false ? [] : virtualHabitTasks
    ), [calendarClutter.showHabitAnchors, virtualHabitTasks]);


    // ── Group month tasks by day-number ─────────────────────────────────────
    // Habits are intentionally NOT injected into tasksByDay for month view —
    // they appear only as a subtle dot indicator to avoid visual clutter.
    const { datesWithTasks, tasksByDay, habitDays } = useMemo(() => {
        const byDay: Record<number, Task[]> = {};
        const withTasks = new Set<number>();
        const habitDaySet = new Set<number>();

        for (const t of visibleMonthTasks) {
            const dateStr = t.scheduledStart ?? t.dueDate;
            if (!dateStr) continue;
            const d = parseEffectiveTaskDate(dateStr, t.isAllDay);
            if (d.getFullYear() === year && d.getMonth() === month) {
                const day = d.getDate();
                withTasks.add(day);
                if (!byDay[day]) byDay[day] = [];
                byDay[day].push(t);
            }
        }
        // Record habit days for dot indicators only
        for (const h of visibleHabitTasks) {
            const dateStr = h.scheduledStart ?? h.dueDate;
            if (!dateStr) continue;
            const d = parseEffectiveTaskDate(dateStr, h.isAllDay);
            if (d.getFullYear() === year && d.getMonth() === month) {
                habitDaySet.add(d.getDate());
                withTasks.add(d.getDate());
            }
        }
        return { datesWithTasks: withTasks, tasksByDay: byDay, habitDays: habitDaySet };
    }, [month, visibleHabitTasks, visibleMonthTasks, year]);

    const holidaysByDateRecord = useMemo<Record<string, import("../lib/holidays/provider").HolidayRecord[]>>(() => {
        return Object.fromEntries(holidayOverlay.holidaysByDate.entries());
    }, [holidayOverlay.holidaysByDate]);

    const holidayDays = useMemo(() => {
        const days = new Set<number>();
        for (const date of holidayOverlay.holidayDateSet) {
            const parsed = parseLocalDate(date);
            if (parsed.getFullYear() === year && parsed.getMonth() === month) {
                days.add(parsed.getDate());
            }
        }
        return days;
    }, [holidayOverlay.holidayDateSet, month, year]);

    // ── Group week tasks by ISO date string ─────────────────────────────────
    const weekTasksByDate = useMemo(() => {
        const map: Record<string, Task[]> = {};
        for (const t of visibleWeekTasks) {
            const dateStr = t.scheduledStart ?? t.dueDate;
            if (!dateStr) continue;
            const iso = getEffectiveTaskDate(dateStr, t.isAllDay);
            if (!map[iso]) map[iso] = [];
            map[iso].push(t);
        }
        for (const h of visibleHabitTasks) {
            const dateStr = h.scheduledStart ?? h.dueDate;
            if (!dateStr) continue;
            const iso = getEffectiveTaskDate(dateStr, h.isAllDay);
            if (!map[iso]) map[iso] = [];
            map[iso].push(h);
        }
        return map;
    }, [visibleHabitTasks, visibleWeekTasks]);

    // ── Task lookup for DragOverlay ─────────────────────────────────────────
    const allVisibleTasks = useMemo(() => {
        const map = new Map<string, Task>();
        const put = (t: Task) => map.set(t.id, t);
        visibleMonthTasks.forEach(put);
        visibleWeekTasks.forEach(put);
        visibleDayTasks.forEach(put);
        visibleHabitTasks.forEach(put);
        return map;
    }, [visibleDayTasks, visibleHabitTasks, visibleMonthTasks, visibleWeekTasks]);

    // ── Phone surface: one grouping (routines included) for marks and lists ─
    const todayIso = toISODate(today);
    const periodRange = { day: dayRange, week: weekRange, month: monthRange, year: yearRange }[viewMode];
    const phoneGroups = useMemo(() => {
        if (!shell.isPhone || viewMode === "year") return new Map<string, Task[]>();
        return groupByDate([...(viewMode === "month" ? visibleMonthTasks : visibleWeekTasks), ...visibleHabitTasks]);
    }, [shell.isPhone, viewMode, visibleHabitTasks, visibleMonthTasks, visibleWeekTasks]);

    /** Holiday, birthday and personal-event names by ISO day, for the phone surface. */
    const phoneMarkers = useMemo(() => {
        const map = new Map<string, string[]>();
        if (!shell.isPhone) return map;
        const add = (iso: string, name: string) => map.set(iso, [...(map.get(iso) ?? []), name]);
        if (holidayOverlay.enabled) {
            for (const [iso, holidays] of Object.entries(holidaysByDateRecord)) holidays.forEach((holiday) => add(iso, holiday.name));
        }
        if (birthdayDate) add(birthdayDate, "Your birthday");
        if (personalEvents.enabled) {
            for (const [iso, events] of Object.entries(personalEventsByDateRecord)) events.forEach((event) => add(iso, event.label));
        }
        return map;
    }, [birthdayDate, holidayOverlay.enabled, holidaysByDateRecord, personalEvents.enabled, personalEventsByDateRecord, shell.isPhone]);

    const weekLoads = useMemo(
        () => new Map(weekDates.map((date) => [toISODate(date), dayLoad(phoneGroups.get(toISODate(date)) ?? [])])),
        [phoneGroups, weekDates],
    );

    const routineEmoji = useCallback(
        (task: Task) => (task.isHabit ? habitById.get(task.id.split("--")[0].replace(/^habit-/, ""))?.emoji ?? null : null),
        [habitById],
    );

    const { data: holdingTasks = [] } = useTasks({ state: "ACTIVE", hasNoProject: true, hasNoDate: true, enabled: isPhoneDay });
    const readyTasks = useMemo(() => holdingTasks.filter((task) => !isPassiveTimetableTask(task)), [holdingTasks]);

    // ── Navigation ──────────────────────────────────────────────────────────
    const handleNavigate = useCallback((delta: number) => {
        setZoom(0);
        setDirection(delta);
        setCurrentDate((prev) => {
            switch (viewMode) {
                case "day": return addDaysToIso(prev, delta);
                case "week": return addDaysToIso(prev, delta * 7);
                case "month": return addMonthsToIso(prev, delta);
                case "year": {
                    const { y, m, d } = parseYMD(prev);
                    return `${y + delta}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                }
            }
        });
    }, [viewMode]);

    // Compact shells change period by dragging the calendar body; the gesture
    // feeds the same direction + slide path the header arrows use. It stands
    // down while a task chip is being dragged so dnd-kit keeps the pointer.
    const { reducedMotion, dragProps } = usePeriodSwipe({
        enabled: shell.isCompact && !activeDragTask,
        onCommit: handleNavigate,
    });

    const slideCustom = useMemo<SlideCustom>(
        () => ({ direction, distance: reducedMotion || zoom ? 0 : 32, zoom: reducedMotion ? 0 : zoom }),
        [direction, reducedMotion, zoom],
    );

    const handleToday = useCallback(() => {
        setZoom(0);
        const now = new Date();
        const todayStr = toISODate(now);
        const cur = parseYMD(currentDate);
        const td = parseYMD(todayStr);
        const tSign = td.y > cur.y || (td.y === cur.y && td.m > cur.m) ? 1 : -1;
        setDirection(tSign);
        setCurrentDate(todayStr);
    }, [currentDate]);

    const handleSelectDate = useCallback((day: number) => {
        const newDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        setCurrentDate(newDate);
        setViewMode("day");
    }, [year, month, setViewMode]);

    // ── View mode change ────────────────────────────────────────────────────
    const handleViewMode = useCallback((mode: CalendarViewMode) => {
        const depth: Record<CalendarViewMode, number> = { day: 0, week: 1, month: 2, year: 3 };
        setZoom(shell.isPhone ? Math.sign(depth[viewMode] - depth[mode]) : 0);
        setDirection(0);
        setViewMode(mode);
    }, [setViewMode, shell.isPhone, viewMode]);

    /** Phone: open a day from Month or Year, zooming in. */
    const openDay = useCallback((iso: string) => {
        setCurrentDate(iso);
        handleViewMode("day");
    }, [handleViewMode]);

    // Scroll-to-navigate removed per audit — invisible gesture that changes calendar
    // structure without visible explanation. Users can navigate via header arrows or keyboard.

    /** Move a task to another day, keeping its time of day and length. One Undo. */
    const moveTaskToDay = useCallback((task: Task, iso: string, { quiet = false } = {}) => {
        const prev = { dueDate: task.dueDate, scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd, isAllDay: task.isAllDay };
        if (task.isAllDay || !task.scheduledStart) {
            updateTask({ id: task.id, dueDate: iso, scheduledStart: null, scheduledEnd: null, isAllDay: true });
        } else {
            const start = preserveLocalTime(iso, task.scheduledStart);
            updateTask({
                id: task.id,
                dueDate: iso,
                scheduledStart: start,
                scheduledEnd: new Date(new Date(start).getTime() + getTaskDurationMs(task)).toISOString(),
                isAllDay: false,
            });
        }
        if (!quiet) {
            toast(`Moved to ${dayLabel(iso)}`, { action: { label: "Undo", onClick: () => updateTask({ id: task.id, ...prev }) } });
        }
        return prev;
    }, [updateTask]);

    // ── DnD sensors ────────────────────────────────────────────────────────
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 10 } }),
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const taskId = (event.active.data.current as { taskId?: string })?.taskId;
        if (taskId) {
            setActiveDragTask(allVisibleTasks.get(taskId) ?? null);
        }
    }, [allVisibleTasks]);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        const taskId = (event.active.data.current as { taskId?: string })?.taskId;
        if (!taskId) {
            setActiveDropId(null);
            return;
        }

        const task = allVisibleTasks.get(taskId);
        if (!task || task.isHabit || isRecurringTask(task) || isRecurringTaskInstance(task)) {
            setActiveDropId(null);
            return;
        }

        setActiveDropId(event.over ? String(event.over.id) : null);
    }, [allVisibleTasks]);

    const handleDragCancel = useCallback((_event: DragCancelEvent) => {
        setActiveDragTask(null);
        setActiveDropId(null);
    }, []);

    const activeDropPreview = useMemo<CalendarDropPreview | null>(() => {
        if (!activeDragTask || activeDragTask.isHabit || !activeDropId) {
            return null;
        }

        if (activeDropId.startsWith("allday-")) {
            return {
                kind: "allday",
                dateStr: activeDropId.replace(/^allday-/, ""),
            };
        }

        if (activeDropId.startsWith("day-")) {
            const dateStr = activeDropId.slice(4);
            if (activeDragTask.isAllDay || !activeDragTask.scheduledStart) {
                return {
                    kind: "allday",
                    dateStr,
                };
            }

            const start = new Date(activeDragTask.scheduledStart);
            const durationMs = getTaskDurationMs(activeDragTask);
            const startMinutes = start.getHours() * 60 + start.getMinutes();
            const endMinutes = Math.min(24 * 60, startMinutes + Math.round(durationMs / 60_000));
            const startIso = preserveLocalTime(dateStr, activeDragTask.scheduledStart);
            const endIso = new Date(new Date(startIso).getTime() + durationMs).toISOString();

            return {
                kind: "timed",
                dateStr,
                startMinutes,
                endMinutes,
                label: `${formatTime(startIso)}${endIso ? ` - ${formatTime(endIso)}` : ""}`,
            };
        }

        const parsedTimedDrop = parseCalendarTimedDropId(activeDropId);
        if (!parsedTimedDrop) {
            return null;
        }

        const { iso } = getDateFromTimedDropId(activeDropId);
        const durationMs = getTaskDurationMs(activeDragTask);
        const endIso = new Date(new Date(iso).getTime() + durationMs).toISOString();
        const endMinutes = Math.min(24 * 60, parsedTimedDrop.minutes + Math.round(durationMs / 60_000));

        return {
            kind: "timed",
            dateStr: parsedTimedDrop.dateStr,
            startMinutes: parsedTimedDrop.minutes,
            endMinutes,
            label: `${formatTime(iso)} - ${formatTime(endIso)}`,
        };
    }, [activeDragTask, activeDropId]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        setActiveDragTask(null);
        setActiveDropId(null);
        const { active, over } = event;
        if (!over) return;

        const taskId = (active.data.current as { taskId?: string })?.taskId;
        if (!taskId) return;

        const droppedId = String(over.id);
        const task = allVisibleTasks.get(taskId);
        if (!task || task.isHabit || isRecurringTask(task) || isRecurringTaskInstance(task)) return;

        // Capture previous state for undo
        const prev = {
            dueDate: task.dueDate,
            scheduledStart: task.scheduledStart,
            scheduledEnd: task.scheduledEnd,
            isAllDay: task.isAllDay,
        };
        const undoMove = () => updateTask({ id: taskId, ...prev });

        if (droppedId.startsWith("slot-")) {
            const { iso, date } = getDateFromTimedDropId(droppedId);
            const durationMs = getTaskDurationMs(task);
            updateTask({
                id: taskId,
                dueDate: date,
                scheduledStart: iso,
                scheduledEnd: new Date(new Date(iso).getTime() + durationMs).toISOString(),
                isAllDay: false,
            });
            trackUsageEvent("schedule.drop_completed", { input_method: "dnd", object_type: "task", outcome: "timed" });
            toast("Task moved", { action: { label: "Undo", onClick: undoMove } });
            return;
        }

        if (droppedId.startsWith("allday-")) {
            const datePart = droppedId.replace(/^allday-/, "");
            updateTask({
                id: taskId,
                dueDate: datePart,
                scheduledStart: null,
                scheduledEnd: null,
                isAllDay: true,
            });
            trackUsageEvent("schedule.drop_completed", { input_method: "dnd", object_type: "task", outcome: "allday" });
            toast("Task moved", { action: { label: "Undo", onClick: undoMove } });
            return;
        }

        if (droppedId.startsWith("day-")) {
            moveTaskToDay(task, droppedId.slice(4), { quiet: true });
            trackUsageEvent("schedule.drop_completed", { input_method: "dnd", object_type: "task", outcome: "day" });
            toast("Task moved", { action: { label: "Undo", onClick: undoMove } });
        }
    }, [allVisibleTasks, moveTaskToDay, updateTask]);

    // ── Task event handlers ─────────────────────────────────────────────────
    const handleSelectTask = useCallback((taskId: string) => {
        if (taskId.startsWith("habit-")) {
            // Compact shells open the routine in the same sheet tasks use; desktop has its page.
            if (shell.isCompact) setSelectedHabitId(taskId.split("--")[0].replace(/^habit-/, ""));
            else navigate("/routines");
            return;
        }
        const task = allVisibleTasks.get(taskId);
        if (!shell.isWide) {
            setMobileDetailMode("peek");
        }
        setSelectedTaskId(task ? getTaskSeriesId(task) : taskId);
    }, [allVisibleTasks, shell.isCompact, shell.isWide, navigate]);

    // ── Phone row actions ───────────────────────────────────────────────────
    const completeRow = useCallback((task: Task) => {
        if (task.isHabit) {
            const [habitPart, targetDate] = task.id.split("--", 2);
            return resolveHabitMutation.mutateAsync({
                habitId: habitPart.replace(/^habit-/, ""),
                targetDate,
                status: task.state === "COMPLETE" ? "PENDING" : "COMPLETED",
            });
        }
        // Same short, cancellable countdown the checkbox shows.
        queueCompletion({ taskId: task.id, onCommit: () => updateTask({ id: task.id, state: "COMPLETE" }) });
    }, [queueCompletion, resolveHabitMutation, updateTask]);

    const moveRowLater = useCallback((task: Task) => {
        const anchor = task.scheduledStart ?? task.dueDate;
        const from = anchor ? getEffectiveTaskDate(anchor, task.isAllDay) : todayIso;
        moveTaskToDay(task, addDaysToIso(from < todayIso ? todayIso : from, 1));
    }, [moveTaskToDay, todayIso]);

    const rowHandlers = useMemo(() => ({
        onOpen: (task: Task) => handleSelectTask(task.id),
        onComplete: completeRow,
        onLater: moveRowLater,
        onPickDay: (task: Task) => setPlaceTask(task),
    }), [completeRow, handleSelectTask, moveRowLater]);

    const handleAddAt = useCallback((start: Date, minutes: number) => {
        setDraftPlacement(null);
        setEventPopoverTab("task");
        setEventPopoverInfo({
            date: toISODate(start),
            startHour: start.getHours(),
            startMinute: start.getMinutes(),
            durationMinutes: minutes,
            anchorX: window.innerWidth / 2,
            anchorY: 140,
        });
    }, []);

    /** Today's open, movable tasks: what "Lighten today" may offer. Never fixed blocks or routines. */
    const lightenCandidates = useMemo(() => (phoneGroups.get(todayIso) ?? []).filter((task) =>
        scheduleKind(task) === "task" && task.state !== "COMPLETE" && !isRecurringTask(task) && !isRecurringTaskInstance(task),
    ), [phoneGroups, todayIso]);

    const lightenToday = useCallback((tasks: Task[], to: "tomorrow" | "holding") => {
        const tomorrow = addDaysToIso(todayIso, 1);
        const previous = tasks.map((task) => {
            const prev = { id: task.id, dueDate: task.dueDate, scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd, isAllDay: task.isAllDay };
            if (to === "tomorrow") moveTaskToDay(task, tomorrow, { quiet: true });
            else updateTask({ id: task.id, dueDate: null, scheduledStart: null, scheduledEnd: null, isAllDay: true });
            return prev;
        });
        toast(to === "tomorrow" ? "Moved to tomorrow" : "Dates cleared", {
            action: { label: "Undo", onClick: () => previous.forEach((prev) => updateTask(prev)) },
        });
    }, [moveTaskToDay, todayIso, updateTask]);

    const handleCompleteTask = useCallback(async (taskId: string) => {
        if (taskId.startsWith("habit-")) {
            const [_, habitId, targetDate] = taskId.split("--", 3);
            const realId = habitId.replace("habit-", "");
            resolveHabit({ habitId: realId, targetDate, status: "COMPLETED" });
            return;
        }
        const task = allVisibleTasks.get(taskId);
        if (task && (isRecurringTask(task) || isRecurringTaskInstance(task))) {
            toast.message("Recurring blocks are edited as a series.");
            return;
        }
        updateTask({ id: taskId, state: "COMPLETE" });
        toast("Task completed", {
            action: { label: "Undo", onClick: () => updateTask({ id: taskId, state: "ACTIVE" }) },
        });
    }, [updateTask, resolveHabit, allVisibleTasks]);

    const handleArchiveTask = useCallback(async (taskId: string) => {
        if (taskId.startsWith("habit-")) {
            const [_, habitId, targetDate] = taskId.split("--", 3);
            const realId = habitId.replace("habit-", "");
            resolveHabit({ habitId: realId, targetDate, status: "SKIPPED" });
            return;
        }
        const task = allVisibleTasks.get(taskId);
        if (task && (isRecurringTask(task) || isRecurringTaskInstance(task))) {
            toast.message("Recurring blocks are edited as a series.");
            return;
        }
        updateTask({ id: taskId, state: "ARCHIVED" });
        toast("Task archived", {
            action: { label: "Undo", onClick: () => updateTask({ id: taskId, state: "ACTIVE" }) },
        });
    }, [updateTask, resolveHabit, allVisibleTasks]);

    const handleResizeTask = useCallback((taskId: string, durationMinutes: number) => {
        const task = allVisibleTasks.get(taskId);
        if (!task || !task.scheduledStart) return;
        const start = new Date(task.scheduledStart);
        const newEnd = new Date(start.getTime() + durationMinutes * 60_000);
        const prevEnd = task.scheduledEnd;
        updateTask({ id: taskId, scheduledEnd: newEnd.toISOString() });
        toast("Duration updated", {
            action: { label: "Undo", onClick: () => updateTask({ id: taskId, scheduledEnd: prevEnd ?? undefined }) },
        });
    }, [updateTask, allVisibleTasks]);

    // ── Year view helpers ───────────────────────────────────────────────────
    const handleYearSelectMonth = useCallback((m: number) => {
        setCurrentDate(`${year}-${String(m + 1).padStart(2, "0")}-01`);
        setViewMode("month");
    }, [year, setViewMode]);

    const handleYearSelectDay = useCallback((dateStr: string) => {
        setCurrentDate(dateStr);
        setViewMode("day");
    }, [setViewMode]);

    // ── Event popover handler ────────────────────────────────────────────
    const handleGridClick = useCallback((info: CalendarEventInfo) => {
        const startMinute = info.startHour * 60 + info.startMinute;
        const endMinute = startMinute + 30; // default 30-min duration
        setDraftPlacement({ dateStr: info.date, startMinute, endMinute });
        setEventPopoverTab("task");
        setEventPopoverInfo(info);
    }, []);

    const handleAddTaskToolbar = useCallback(() => {
        const now = new Date();
        const hour = now.getHours();
        trackUsageEvent("schedule.quick_add_used", { surface: "schedule_toolbar", object_type: "task" });
        setEventPopoverTab("task");
        setEventPopoverInfo({
            date: currentDate,
            startHour: Math.min(23, hour + 1),
            startMinute: 0,
            anchorX: window.innerWidth / 2,
            anchorY: 140,
        });
    }, [currentDate]);

    const handleAddEventToolbar = useCallback(() => {
        setDraftPlacement(null);
        setEventPopoverTab("event");
        setEventPopoverInfo({
            date: currentDate,
            startHour: 9,
            startMinute: 0,
            isAllDay: true,
            anchorX: window.innerWidth / 2,
            anchorY: 140,
        });
    }, [currentDate]);

    const handleManageEvents = useCallback(() => {
        navigate("/events");
    }, [navigate]);

    // ── Schedule-specific keyboard shortcuts ────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const inInput =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target.isContentEditable;
            if (inInput) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            switch (e.key.toLowerCase()) {
                case "d":
                    e.preventDefault();
                    setDirection(0);
                    setViewMode("day");
                    break;
                case "w":
                    e.preventDefault();
                    setDirection(0);
                    setViewMode("week");
                    break;
                case "m":
                    e.preventDefault();
                    setDirection(0);
                    setViewMode("month");
                    break;
                case "y":
                    e.preventDefault();
                    setDirection(0);
                    setViewMode("year");
                    break;
                case "t":
                    e.preventDefault();
                    handleToday();
                    break;
                case "c":
                    e.preventDefault();
                    setEventPopoverTab("task");
                    setEventPopoverInfo({
                        date: currentDate,
                        startHour: (() => {
                            const now = new Date();
                            return Math.min(23, now.getHours() + 1);
                        })(),
                        startMinute: 0,
                        anchorX: window.innerWidth / 2,
                        anchorY: 140,
                    });
                    break;
                case "escape":
                    e.preventDefault();
                    if (eventPopoverInfo) {
                        setEventPopoverInfo(null);
                        setDraftPlacement(null);
                    } else if (selectedTaskId) {
                        setSelectedTaskId(null);
                    }
                    break;
                case "arrowleft":
                    e.preventDefault();
                    handleNavigate(-1);
                    break;
                case "arrowright":
                    e.preventDefault();
                    handleNavigate(1);
                    break;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentDate, eventPopoverInfo, selectedTaskId, handleToday, handleNavigate]);

    const holidayPrompts = <LocationNotice />;

    const overflowContent = (
        <div className="space-y-4">
            <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-twilight-text-muted mb-2">Clutter</h4>
                <div className="space-y-2">
                    <label className="flex items-center justify-between rounded-xl border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-sm text-twilight-text-soft">
                        <span>Show all-day tasks</span>
                        <Switch
                            checked={calendarClutter.showAllDay}
                            onCheckedChange={(val) => updateSettings.mutate({ calendar: { clutter: { showAllDay: val } } })}
                        />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-sm text-twilight-text-soft">
                        <span>Show timed blocks</span>
                        <Switch
                            checked={calendarClutter.showTimedTasks}
                            onCheckedChange={(val) => updateSettings.mutate({ calendar: { clutter: { showTimedTasks: val } } })}
                        />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-sm text-twilight-text-soft">
                        <span>Show fixed blocks</span>
                        <Switch
                            checked={calendarClutter.showFixed !== false}
                            onCheckedChange={(val) => updateSettings.mutate({ calendar: { clutter: { showFixed: val } } })}
                        />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-sm text-twilight-text-soft">
                        <span>Show routine markers</span>
                        <Switch
                            checked={calendarClutter.showHabitAnchors}
                            onCheckedChange={(val) => updateSettings.mutate({ calendar: { clutter: { showHabitAnchors: val } } })}
                        />
                    </label>
                </div>
            </div>
            <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-twilight-text-muted mb-2">Holidays</h4>
                <div className="space-y-2">
                    <label className="flex items-center justify-between rounded-xl border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-sm text-twilight-text-soft">
                        <span>Show holidays</span>
                        <div className="flex items-center gap-2">
                            {holidayOverlay.enabled && (
                                <Tip label="Configure holiday location" side="top">
                                    <button
                                        type="button"
                                        className="rounded-lg p-1 text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors cursor-pointer"
                                        onClick={(e) => { e.preventDefault(); navigate("?settings=location"); }}
                                        aria-label="Configure holiday location"
                                    >
                                        <Wrench size={14} />
                                    </button>
                                </Tip>
                            )}
                            <Switch
                                checked={holidayOverlay.enabled}
                                onCheckedChange={(val) => holidayOverlay.setEnabled(val)}
                            />
                        </div>
                    </label>
                </div>
            </div>
            <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-twilight-text-muted mb-2">Events</h4>
                <div className="space-y-2">
                    <label className="flex items-center justify-between rounded-xl border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-sm text-twilight-text-soft">
                        <span>Show personal events</span>
                        <div className="flex items-center gap-2">
                            {personalEvents.enabled && (
                                <Tip label="Manage events" side="top">
                                    <button
                                        type="button"
                                        className="rounded-lg p-1 text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors cursor-pointer"
                                        onClick={(e) => { e.preventDefault(); handleManageEvents(); }}
                                        aria-label="Manage events"
                                    >
                                        <Wrench size={14} />
                                    </button>
                                </Tip>
                            )}
                            <Switch
                                checked={personalEvents.enabled}
                                onCheckedChange={(value) => personalEvents.setEnabled(value)}
                            />
                        </div>
                    </label>
                </div>
            </div>
        </div>
    );

    const tasksShown = calendarClutter.showAllDay !== false && calendarClutter.showTimedTasks !== false;
    const showRow = (label: string, checked: boolean, onChange: (value: boolean) => void, extra?: React.ReactNode) => (
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-sm text-twilight-text">
            <span>{label}</span>
            <span className="flex items-center gap-1">
                {extra}
                <Switch checked={checked} onCheckedChange={onChange} />
            </span>
        </label>
    );

    /** Phone ⋯: which zoom level, what to show (in the user's words), and relief for today. */
    const phoneOptions = (
        <div className="space-y-4">
            <div role="radiogroup" aria-label="View" className="grid grid-cols-3 gap-1 rounded-2xl border border-twilight-border/40 p-1">
                {(["day", "month", "year"] as const).map((mode) => (
                    <Popover.Close asChild key={mode}>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={viewMode === mode}
                            onClick={() => handleViewMode(mode)}
                            className={`min-h-11 cursor-pointer rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                viewMode === mode ? "bg-accent-primary/20 text-accent-primary" : "text-twilight-text-soft hover:bg-white/[0.05]"
                            }`}
                        >
                            {mode === "day" ? "Day" : mode === "month" ? "Month" : "Year"}
                        </button>
                    </Popover.Close>
                ))}
            </div>

            <div>
                <h4 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-twilight-text-muted">Show</h4>
                {showRow("Fixed", calendarClutter.showFixed !== false, (val) => updateSettings.mutate({ calendar: { clutter: { showFixed: val } } }))}
                {showRow("Routines", calendarClutter.showHabitAnchors !== false, (val) => updateSettings.mutate({ calendar: { clutter: { showHabitAnchors: val } } }))}
                {showRow("Tasks", tasksShown, (val) => updateSettings.mutate({ calendar: { clutter: { showAllDay: val, showTimedTasks: val } } }))}
                {showRow("Holidays", holidayOverlay.enabled, (val) => holidayOverlay.setEnabled(val), holidayOverlay.enabled ? (
                    <button
                        type="button"
                        className="btn-icon rounded-lg text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                        onClick={(e) => { e.preventDefault(); navigate("?settings=location"); }}
                        aria-label="Configure holiday location"
                    >
                        <Wrench size={14} />
                    </button>
                ) : null)}
                {showRow("Events", personalEvents.enabled, (val) => personalEvents.setEnabled(val), personalEvents.enabled ? (
                    <button
                        type="button"
                        className="btn-icon rounded-lg text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                        onClick={(e) => { e.preventDefault(); handleManageEvents(); }}
                        aria-label="Manage events"
                    >
                        <Wrench size={14} />
                    </button>
                ) : null)}
            </div>

            {isPhoneDay && currentDate === todayIso && lightenCandidates.length > 0 ? (
                <Popover.Close asChild>
                    <button
                        type="button"
                        onClick={() => setLightenOpen(true)}
                        className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-twilight-border/40 px-3 text-left text-sm text-twilight-text transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <Feather size={15} className="text-accent-primary" aria-hidden="true" />
                        <span className="flex-1">Lighten today…</span>
                    </button>
                </Popover.Close>
            ) : null}
        </div>
    );

    const selectedHabit = selectedHabitId ? habitById.get(selectedHabitId) ?? null : null;

    const isOffToday = viewMode === "year"
        ? year !== today.getFullYear()
        : viewMode === "month"
            ? year !== today.getFullYear() || month !== today.getMonth()
            : currentDate !== todayIso;

    /** Phone header: name what's on screen; the label above zooms out. */
    const phoneHeader = useMemo(() => {
        if (viewMode === "year") return { title: String(year) };
        if (viewMode === "month") {
            return {
                title: year === today.getFullYear() ? MONTH_NAMES[month] : `${MONTH_NAMES[month]} ${year}`,
                backLabel: String(year),
                onZoomOut: () => handleViewMode("year"),
            };
        }
        const date = parseLocalDate(currentDate);
        const days = Math.round((date.getTime() - parseLocalDate(todayIso).getTime()) / 86_400_000);
        const relation = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : days > 0 ? `In ${days} days` : `${-days} days ago`;
        const items = phoneGroups.get(currentDate) ?? [];
        return {
            title: format(date, "EEEE d MMMM"),
            meta: items.length ? `${relation} · ${loadWord(dayLoad(items))}` : relation,
            backLabel: MONTH_NAMES[month],
            onZoomOut: () => handleViewMode("month"),
        };
    }, [currentDate, handleViewMode, month, phoneGroups, todayIso, viewMode, year]);

    // ── View key for AnimatePresence ────────────────────────────────────────
    const viewKey = viewMode === "month"
        ? `month-${year}-${month}`
        : viewMode === "week"
            ? `week-${toISODate(weekDates[0])}`
            : viewMode === "day"
                ? `day-${currentDate}`
                : `year-${year}`;

    const sidePanel = (
        <EditSidePanelRail ariaLabel="Resize schedule detail panel" defaultWidth={360} minWidth={300} maxWidth={520}>
            {shell.isWide && selectedTaskId ? (
                <EditSidePanel kind="task" taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
            ) : null}
        </EditSidePanelRail>
    );

    return (
        <MainLayout requireAuth hideHeader hideContextualOrb sidePanel={sidePanel} sidePanelActive={Boolean(selectedTaskId)} sidePanelLabel="Task">
            <DndContext
                sensors={sensors}
                collisionDetection={(args) => {
                    const pointerCollisions = pointerWithin(args);
                    return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
                }}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragCancel={handleDragCancel}
                onDragEnd={handleDragEnd}
            >
                <div className="h-full flex flex-col overflow-hidden">
                    {/* Header */}
                    <ScheduleHeader
                        year={year}
                        month={month}
                        currentDate={currentDate}
                        viewMode={viewMode}
                        onViewMode={handleViewMode}
                        onNavigate={handleNavigate}
                        onToday={handleToday}
                        isCurrentPeriod={todayIso >= periodRange.start && todayIso <= periodRange.end}
                        onAddTask={handleAddTaskToolbar}
                        onAddEvent={handleAddEventToolbar}
                        overflowContent={shell.isPhone ? phoneOptions : overflowContent}
                        compact={shell.isCompact}
                        phone={shell.isPhone ? phoneHeader : undefined}
                    />

                    {/* Phone Day: the week stays put while the day below swipes. */}
                    {isPhoneDay ? (
                        <DayStrip
                            weekDates={weekDates}
                            selectedIso={currentDate}
                            loads={weekLoads}
                            markedDays={new Set(phoneMarkers.keys())}
                            onSelect={(iso) => {
                                setZoom(0);
                                setDirection(iso > currentDate ? 1 : -1);
                                setCurrentDate(iso);
                            }}
                            onShiftWeek={(delta) => {
                                setZoom(0);
                                setDirection(delta);
                                setCurrentDate((prev) => addDaysToIso(prev, delta * 7));
                            }}
                        />
                    ) : null}

                    {/* Main calendar area */}
                    <div className="flex-1 min-h-0 relative flex overflow-hidden">
                        {/* Calendar views */}
                        <motion.div
                            {...dragProps}
                            className={`flex-1 min-w-0 relative overflow-hidden${shell.isCompact ? " select-none" : ""}`}
                        >
                            <AnimatePresence initial={false} custom={slideCustom} mode="wait">
                                <motion.div
                                    key={viewKey}
                                    custom={slideCustom}
                                    variants={slideVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={reducedMotion ? { duration: 0 } : {
                                        x: { type: "spring", stiffness: 320, damping: 32 },
                                        scale: { type: "spring", stiffness: 380, damping: 34 },
                                        opacity: { duration: 0.18 },
                                    }}
                                    className="absolute inset-0 flex flex-col"
                                >
                                    {/* ── MONTH ── */}
                                    {viewMode === "month" && (
                                        shell.isPhone ? (
                                            <MonthFold
                                                year={year}
                                                month={month}
                                                selectedIso={currentDate}
                                                groups={phoneGroups}
                                                markers={phoneMarkers}
                                                routineEmoji={routineEmoji}
                                                onSelect={setCurrentDate}
                                                onOpenDay={openDay}
                                                onNextMonth={() => handleNavigate(1)}
                                                dragActive={Boolean(activeDragTask)}
                                                reducedMotion={Boolean(reducedMotion)}
                                                {...rowHandlers}
                                            />
                                        ) : (
                                        <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4">
                                            <CalendarGrid
                                                year={year}
                                                month={month}
                                                selectedDate={currentDate}
                                                datesWithTasks={datesWithTasks}
                                                habitDays={habitDays}
                                                holidayDays={holidayOverlay.enabled ? holidayDays : undefined}
                                                birthdayDay={birthdayDay}
                                                personalEventDays={personalEvents.enabled ? personalEvents.eventDays : undefined}
                                                personalEventCountsByDay={personalEventCountsByDay}
                                                onSelectDate={handleSelectDate}
                                                variant="full"
                                                tasksByDay={tasksByDay}
                                                onSelectTask={handleSelectTask}
                                                onCompleteTask={handleCompleteTask}
                                                onArchiveTask={handleArchiveTask}
                                                onContextAdd={handleGridClick}
                                            />
                                        </div>
                                        )
                                    )}

                                    {/* ── WEEK ── */}
                                    {viewMode === "week" && (
                                            <WeekView
                                                weekDates={weekDates}
                                                tasksByDate={weekTasksByDate}
                                                holidaysByDate={holidayOverlay.enabled ? holidaysByDateRecord : undefined}
                                                birthdayDate={birthdayDate}
                                                personalEventsByDate={personalEvents.enabled ? personalEventsByDateRecord : undefined}
                                                activeDropPreview={activeDropPreview}
                                                draftPlacement={draftPlacement}
                                                onSelectTask={handleSelectTask}
                                                onCompleteTask={handleCompleteTask}
                                                onArchiveTask={handleArchiveTask}
                                                onResizeTask={handleResizeTask}
                                                onGridClick={handleGridClick}
                                                onJumpToDay={(dateStr) => { setCurrentDate(dateStr); setViewMode("day"); }}
                                            />
                                    )}

                                    {/* ── DAY ── */}
                                    {viewMode === "day" && (
                                        shell.isPhone ? (
                                            <DayAgenda
                                                dateIso={currentDate}
                                                tasks={phoneGroups.get(currentDate) ?? []}
                                                holidays={holidayOverlay.enabled ? (holidaysByDateRecord[currentDate] ?? []) : []}
                                                isBirthday={birthdayDate === currentDate}
                                                personalEvents={personalEvents.enabled ? personalEvents.getEventsForDate(currentDate) : []}
                                                routineEmoji={routineEmoji}
                                                hasReady={readyTasks.length > 0}
                                                onOpenReady={() => setReadyOpen(true)}
                                                onAddAt={handleAddAt}
                                                dragActive={Boolean(activeDragTask)}
                                                reducedMotion={Boolean(reducedMotion)}
                                                {...rowHandlers}
                                            />
                                        ) : (
                                            <DayView
                                                currentDate={currentDate}
                                                tasks={[...visibleDayTasks, ...visibleHabitTasks.filter(t => t.dueDate?.substring(0, 10) === currentDate)]}
                                                holidays={holidayOverlay.enabled ? (holidaysByDateRecord[currentDate] ?? []) : []}
                                                isBirthday={birthdayDate === currentDate}
                                                personalEvents={personalEvents.enabled ? personalEvents.getEventsForDate(currentDate) : []}
                                                activeDropPreview={activeDropPreview}
                                                draftPlacement={draftPlacement}
                                                onSelectTask={handleSelectTask}
                                                onCompleteTask={handleCompleteTask}
                                                onArchiveTask={handleArchiveTask}
                                                onResizeTask={handleResizeTask}
                                                onGridClick={handleGridClick}
                                            />
                                        )
                                    )}

                                    {/* ── YEAR ── */}
                                    {viewMode === "year" && (
                                        <div className="flex-1 min-h-0 p-4">
                                            <YearView
                                                year={year}
                                                tasks={visibleYearTasks}
                                                holidayDateSet={holidayOverlay.enabled ? holidayOverlay.holidayDateSet : undefined}
                                                birthdayDate={birthdayDate}
                                                personalEventDateSet={personalEvents.enabled ? personalEvents.eventDateSet : undefined}
                                                personalEventDateCounts={personalEventDateCounts}
                                                onSelectMonth={handleYearSelectMonth}
                                                onSelectDay={handleYearSelectDay}
                                                compact={shell.isPhone}
                                            />
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </motion.div>

                    </div>
                </div>

                {/* Compact shells get the same bottom-right orb every other page
                    uses; the dock owns the centre, so a centred pill collided. */}
                <AnimatePresence>
                    {shell.isPhone && isOffToday ? (
                        <motion.div
                            key="back-to-today"
                            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
                            transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
                            className="layer-floating-bar mobile-floating-action fixed bottom-5 left-4"
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    if (viewMode === "year") handleViewMode("month");
                                    handleToday();
                                }}
                                className="flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-twilight-border/60 bg-panel-raised/90 px-4 text-sm font-medium text-twilight-text shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-md transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                            >
                                <CalendarCheck size={16} className="text-accent-primary" aria-hidden="true" />
                                Today
                            </button>
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                {shell.isCompact ? (
                    <div className="layer-floating-bar pointer-events-none mobile-floating-action fixed bottom-5 right-4 flex flex-col items-end sm:right-5">
                        <Tip label="Add to schedule" side="left">
                            <button
                                type="button"
                                onClick={handleAddTaskToolbar}
                                aria-label="Add to schedule"
                                className="pointer-events-auto flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-accent-primary/20 bg-accent-primary text-[var(--primary-foreground)] shadow-[0_24px_54px_color-mix(in_srgb,var(--accent-primary)_34%,transparent)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Plus size={20} aria-hidden="true" />
                            </button>
                        </Tip>
                    </div>
                ) : null}

                {/* ── Event creation popover ── */}
                <AnimatePresence>
                    {eventPopoverInfo && (
                        <CalendarEventPopover
                            info={eventPopoverInfo}
                            initialTab={eventPopoverTab}
                            onClose={() => { setEventPopoverInfo(null); setDraftPlacement(null); }}
                        />
                    )}
                </AnimatePresence>

                {/* DragOverlay — floats above everything while dragging */}
                <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.72, 0.32, 1)" }}>
                    {activeDragTask && (
                        <CalendarTaskChipOverlay task={activeDragTask} />
                    )}
                </DragOverlay>
            </DndContext>

            {!shell.isWide && selectedTaskId && (
                <ResponsiveOverlayPanel
                    ariaLabel="Schedule task details"
                    open={Boolean(selectedTaskId)}
                    onClose={() => setSelectedTaskId(null)}
                    mode={mobileDetailMode}
                >
                    <EditSidePanel kind="task"
                        taskId={selectedTaskId}
                        detailMode={mobileDetailMode}
                        onDetailModeChange={setMobileDetailMode}
                        onClose={() => setSelectedTaskId(null)}
                    />
                </ResponsiveOverlayPanel>
            )}
            {shell.isCompact && selectedHabit ? (
                <ResponsiveOverlayPanel ariaLabel="Routine details" open onClose={() => setSelectedHabitId(null)} mode="peek">
                    <EditSidePanel kind="habit" habit={selectedHabit} onClose={() => setSelectedHabitId(null)} />
                </ResponsiveOverlayPanel>
            ) : null}
            {shell.isPhone ? (
                <>
                    <PlaceSheet
                        open={Boolean(placeTask)}
                        task={placeTask}
                        onClose={() => setPlaceTask(null)}
                        onOpenTask={handleSelectTask}
                        onPlace={(task, iso) => moveTaskToDay(task, iso)}
                    />
                    <ReadyToPlaceSheet open={readyOpen} dateIso={currentDate} tasks={readyTasks} onClose={() => setReadyOpen(false)} />
                    <LightenTodaySheet open={lightenOpen} tasks={lightenCandidates} onClose={() => setLightenOpen(false)} onMove={lightenToday} />
                </>
            ) : null}
            {holidayPrompts}
        </MainLayout>
    );
}
