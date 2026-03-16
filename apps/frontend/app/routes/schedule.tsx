import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import * as Popover from "../components/primitives/Popover";
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
import { YearView } from "../components/calendar/YearView";
import { ScheduleHeader, type CalendarViewMode } from "../components/calendar/ScheduleHeader";
import { CalendarTaskChipOverlay } from "../components/calendar/CalendarTaskChip";
import { CalendarEventPopover, type CalendarEventInfo } from "../components/calendar/CalendarEventPopover";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { useTasks, useUpdateTask } from "../hooks/tasks";
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
} from "../lib/utils/date-format";
import type { Task } from "../types/task";
import { useVirtualHabitTasks } from "../hooks/habits/use-virtual-habit-tasks";
import { useApiClient } from "../hooks/auth/use-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/api/query-keys";
import { invalidateEverywhere } from "../lib/api/workspace-cache";
import { toast } from "sonner";
import * as Dialog from "../components/primitives/Dialog";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import {
    getDateFromTimedDropId,
    parseCalendarTimedDropId,
    type CalendarDropPreview,
} from "../lib/utils/calendar-dnd";
import { getTaskSeriesId, isRecurringTask, isRecurringTaskInstance } from "../lib/utils/task-scheduling";
import { MouseSensor, TouchSensor } from "../lib/utils/dnd";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import {
    HolidayAccuracyHint,
    HolidayLocationPrompt,
    HolidayPreferencesPanel,
} from "../components/calendar/HolidayControls";
import { useHolidayOverlay } from "../hooks/environment/use-holiday-overlay";
import { useSettings } from "../hooks/core/use-settings";
import { parseYMD, addDaysToIso, addMonthsToIso, getTaskDurationMs } from "../lib/utils/calendar-math";

const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 32 : -32, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -32 : 32, opacity: 0 }),
};

// ── component ──────────────────────────────────────────────────────────────

export default function Schedule() {
    const shell = useShellMode();
    const today = new Date();
    const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
    const [currentDate, setCurrentDate] = useState<string>(toISODate(today));
    const [direction, setDirection] = useState(0);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
    const [activeDropId, setActiveDropId] = useState<string | null>(null);
    const [eventPopoverInfo, setEventPopoverInfo] = useState<CalendarEventInfo | null>(null);
    const [holidayPopoverOpen, setHolidayPopoverOpen] = useState(false);
    const [holidayPromptOpen, setHolidayPromptOpen] = useState(false);
    const scrollLockRef = useRef(false);
    const hasAppliedCompactDefault = useRef(false);

    useDocumentMeta(
        "Schedule · Cadence",
        "View your week, day, month, and year with a calmer scheduling workspace built for focus.",
    );

    useEffect(() => {
        if (shell.isDesktop) {
            hasAppliedCompactDefault.current = false;
            return;
        }

        if (hasAppliedCompactDefault.current) return;

        setViewMode(shell.isPhone ? "day" : "week");
        hasAppliedCompactDefault.current = true;
    }, [shell.isDesktop, shell.isPhone]);

    const { mutate: updateTask } = useUpdateTask();

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
        enabled: viewMode === "week",
    });

    const dayRange = useMemo(() => {
        const { y, m, d } = parseYMD(currentDate);
        const start = new Date(y, m, d, 0, 0, 0, 0);
        const end = new Date(y, m, d, 23, 59, 59, 999);
        return { start: start.toISOString(), end: end.toISOString() };
    }, [currentDate]);
    const { data: dayTasks = [] } = useTasks({
        state: "ACTIVE",
        scheduledRange: dayRange,
        enabled: viewMode === "day",
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

        if (viewMode === "week") {
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
    }, [currentDate, monthRange.end, monthRange.start, viewMode, weekRange.end, weekRange.start, yearRange.end, yearRange.start]);

    const holidayOverlay = useHolidayOverlay({
        start: holidayQueryRange.start,
        end: holidayQueryRange.end,
        viewMode,
    });

    // ── Birthday overlay ───────────────────────────────────────────────────
    const { data: userSettings } = useSettings();
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

    // ── Habits injection ───────────────────────────────────────────────────
    const habitRange = useMemo(() => {
        if (viewMode === "year") return { start: "", end: "", enabled: false };
        const ranges = { month: monthRange, week: weekRange, day: dayRange };
        const r = ranges[viewMode as keyof typeof ranges];
        return {
            start: typeof r.start === "string" ? r.start.substring(0, 10) : "",
            end: typeof r.end === "string" ? r.end.substring(0, 10) : "",
            enabled: true,
        };
    }, [viewMode, monthRange, weekRange, dayRange]);

    const virtualHabitTasks = useVirtualHabitTasks(habitRange);

    const client = useApiClient();
    const queryClient = useQueryClient();

    // ── Group month tasks by day-number ─────────────────────────────────────
    // Habits are intentionally NOT injected into tasksByDay for month view —
    // they appear only as a subtle dot indicator to avoid visual clutter.
    const { datesWithTasks, tasksByDay, habitDays } = useMemo(() => {
        const byDay: Record<number, Task[]> = {};
        const withTasks = new Set<number>();
        const habitDaySet = new Set<number>();

        for (const t of monthTasks) {
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
        for (const h of virtualHabitTasks) {
            const dateStr = h.scheduledStart ?? h.dueDate;
            if (!dateStr) continue;
            const d = parseEffectiveTaskDate(dateStr, h.isAllDay);
            if (d.getFullYear() === year && d.getMonth() === month) {
                habitDaySet.add(d.getDate());
                withTasks.add(d.getDate());
            }
        }
        return { datesWithTasks: withTasks, tasksByDay: byDay, habitDays: habitDaySet };
    }, [monthTasks, year, month, virtualHabitTasks]);

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
        for (const t of weekTasks) {
            const dateStr = t.scheduledStart ?? t.dueDate;
            if (!dateStr) continue;
            const iso = getEffectiveTaskDate(dateStr, t.isAllDay);
            if (!map[iso]) map[iso] = [];
            map[iso].push(t);
        }
        for (const h of virtualHabitTasks) {
            const dateStr = h.scheduledStart ?? h.dueDate;
            if (!dateStr) continue;
            const iso = getEffectiveTaskDate(dateStr, h.isAllDay);
            if (!map[iso]) map[iso] = [];
            map[iso].push(h);
        }
        return map;
    }, [weekTasks, virtualHabitTasks]);

    // ── Task lookup for DragOverlay ─────────────────────────────────────────
    const allVisibleTasks = useMemo(() => {
        const map = new Map<string, Task>();
        const put = (t: Task) => map.set(t.id, t);
        monthTasks.forEach(put);
        weekTasks.forEach(put);
        dayTasks.forEach(put);
        virtualHabitTasks.forEach(put);
        return map;
    }, [monthTasks, weekTasks, dayTasks, virtualHabitTasks]);

    // ── Navigation ──────────────────────────────────────────────────────────
    const handleNavigate = useCallback((delta: number) => {
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

    const handleToday = useCallback(() => {
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
    }, [year, month]);

    // ── View mode change ────────────────────────────────────────────────────
    const handleViewMode = useCallback((mode: CalendarViewMode) => {
        setDirection(0);
        setViewMode(mode);
    }, []);

    // ── Scroll-to-navigate (month only) ────────────────────────────────────
    const handleWheel = (e: React.WheelEvent) => {
        if (viewMode !== "month") return;
        if (scrollLockRef.current) return;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) > 30) {
            handleNavigate(delta > 0 ? 1 : -1);
            scrollLockRef.current = true;
            setTimeout(() => { scrollLockRef.current = false; }, 600);
        }
    };

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
            const startIso = new Date(`${dateStr}T${start.toISOString().slice(11)}`).toISOString();
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
            return;
        }

        if (droppedId.startsWith("day-")) {
            const datePart = droppedId.slice(4);
            const durationMs = getTaskDurationMs(task);

            if (task.isAllDay || !task.scheduledStart) {
                updateTask({
                    id: taskId,
                    dueDate: datePart,
                    scheduledStart: null,
                    scheduledEnd: null,
                    isAllDay: true,
                });
                return;
            }

            const preservedStart = preserveLocalTime(datePart, task.scheduledStart);

            updateTask({
                id: taskId,
                dueDate: datePart,
                scheduledStart: preservedStart,
                scheduledEnd: new Date(new Date(preservedStart).getTime() + durationMs).toISOString(),
                isAllDay: false,
            });
        }
    }, [allVisibleTasks, updateTask]);

    // ── Task event handlers ─────────────────────────────────────────────────
    const handleSelectTask = useCallback((taskId: string) => {
        if (taskId.startsWith("habit-")) {
            window.location.href = "/habits";
            return;
        }
        const task = allVisibleTasks.get(taskId);
        setSelectedTaskId(task ? getTaskSeriesId(task) : taskId);
    }, [allVisibleTasks]);

    const handleCompleteTask = useCallback(async (taskId: string) => {
        if (taskId.startsWith("habit-")) {
            const [_, habitId, targetDate] = taskId.split("--", 3);
            const realId = habitId.replace("habit-", "");
            try {
                await client.api.habits[":id"].resolve.$post({
                    param: { id: realId },
                    json: { targetDate, status: "COMPLETED" },
                });
                await invalidateEverywhere(queryClient, queryKeys.habits.all);
            } catch (err) {
                toast.error("Failed to resolve habit");
            }
            return;
        }
        const task = allVisibleTasks.get(taskId);
        if (task && (isRecurringTask(task) || isRecurringTaskInstance(task))) {
            toast.message("Recurring blocks are edited as a series.");
            return;
        }
        updateTask({ id: taskId, state: "COMPLETE" });
    }, [updateTask, client, queryClient, allVisibleTasks]);

    const handleArchiveTask = useCallback(async (taskId: string) => {
        if (taskId.startsWith("habit-")) {
            const [_, habitId, targetDate] = taskId.split("--", 3);
            const realId = habitId.replace("habit-", "");
            try {
                await client.api.habits[":id"].resolve.$post({
                    param: { id: realId },
                    json: { targetDate, status: "SKIPPED" },
                });
                await invalidateEverywhere(queryClient, queryKeys.habits.all);
            } catch (err) {
                toast.error("Failed to dismiss habit");
            }
            return;
        }
        const task = allVisibleTasks.get(taskId);
        if (task && (isRecurringTask(task) || isRecurringTaskInstance(task))) {
            toast.message("Recurring blocks are edited as a series.");
            return;
        }
        updateTask({ id: taskId, state: "ARCHIVED" });
    }, [updateTask, client, queryClient, allVisibleTasks]);

    // ── Year view helpers ───────────────────────────────────────────────────
    const handleYearSelectMonth = useCallback((m: number) => {
        setCurrentDate(`${year}-${String(m + 1).padStart(2, "0")}-01`);
        setViewMode("month");
    }, [year]);

    const handleYearSelectDay = useCallback((dateStr: string) => {
        setCurrentDate(dateStr);
        setViewMode("day");
    }, []);

    // ── Event popover handler ────────────────────────────────────────────
    const handleGridClick = useCallback((info: CalendarEventInfo) => {
        setEventPopoverInfo(info);
    }, []);

    const handleAddTaskToolbar = useCallback(() => {
        const now = new Date();
        const hour = now.getHours();
        setEventPopoverInfo({
            date: currentDate,
            startHour: Math.min(23, hour + 1),
            startMinute: 0,
            anchorX: window.innerWidth / 2,
            anchorY: 140,
        });
    }, [currentDate]);

    useEffect(() => {
        setHolidayPromptOpen(holidayOverlay.shouldShowPrompt);
    }, [holidayOverlay.shouldShowPrompt]);

    const handleUsePreciseHolidayLocation = useCallback(async () => {
        const result = await holidayOverlay.requestPreciseLocation();

        if (result.status === "granted" || result.status === "denied" || result.status === "unsupported") {
            setHolidayPromptOpen(false);
            return;
        }

        toast.error("Couldn’t refine holiday location just now.");
    }, [holidayOverlay]);

    const handleDismissHolidayPrompt = useCallback(() => {
        holidayOverlay.dismissPrompt();
        setHolidayPromptOpen(false);
    }, [holidayOverlay]);

    const handleDismissHolidayPromptPermanently = useCallback(() => {
        holidayOverlay.dismissPromptPermanently();
        setHolidayPromptOpen(false);
    }, [holidayOverlay]);

    const handleChooseHolidayLocationManually = useCallback(() => {
        holidayOverlay.setLocationMode("manual");
        holidayOverlay.dismissPrompt();
        setHolidayPromptOpen(false);
        setHolidayPopoverOpen(true);
    }, [holidayOverlay]);

    const holidayControls = (
        <div className="relative">
            <Popover.Root open={holidayPopoverOpen} onOpenChange={setHolidayPopoverOpen}>
                <div className="inline-flex min-h-11 items-center gap-1 rounded-2xl border border-twilight-border bg-white/[0.03] p-1">
                    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-twilight-text">
                        <input
                            type="checkbox"
                            className="sr-only"
                            checked={holidayOverlay.holidaySettings.enabled}
                            onChange={(event) => holidayOverlay.setEnabled(event.target.checked)}
                            aria-label="Toggle holiday overlay"
                        />
                        <span
                            aria-hidden="true"
                            className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                                holidayOverlay.holidaySettings.enabled
                                    ? "border-lantern/45 bg-lantern/18 text-lantern"
                                    : "border-twilight-border-light bg-white/[0.02] text-transparent"
                            }`}
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path
                                    d="M2.5 6.2L4.8 8.4L9.4 3.6"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>
                        <span>Holidays</span>
                    </label>

                    {holidayOverlay.permissionState === "denied" ? <HolidayAccuracyHint variant="icon" /> : null}

                    <Popover.Trigger asChild>
                        <button
                            type="button"
                            className="btn-icon h-11 w-11 rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                            aria-label="Holiday overlay settings"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M4 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <path d="M17 7h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <path d="M4 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <path d="M11 17h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <circle cx="15" cy="7" r="2" stroke="currentColor" strokeWidth="1.8" />
                                <circle cx="9" cy="17" r="2" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                        </button>
                    </Popover.Trigger>
                </div>
                <Popover.Content align="end" className="w-[min(26rem,calc(100vw-2rem))]">
                    {holidayOverlay.permissionState === "denied" ? (
                        <div className="mb-4 flex items-center gap-2 text-xs text-twilight-text-soft">
                            <HolidayAccuracyHint />
                        </div>
                    ) : null}
                    <HolidayPreferencesPanel
                        enabled={holidayOverlay.holidaySettings.enabled}
                        usePreciseLocation={holidayOverlay.holidaySettings.usePreciseLocation}
                        locationMode={holidayOverlay.holidaySettings.locationMode}
                        countryCode={holidayOverlay.holidaySettings.countryCode}
                        subdivisionCode={holidayOverlay.holidaySettings.subdivisionCode}
                        countryOptions={holidayOverlay.countryOptions}
                        subdivisionOptions={holidayOverlay.subdivisionOptions}
                        effectiveCountryLabel={holidayOverlay.effectiveCountryLabel}
                        effectiveSubdivisionLabel={holidayOverlay.effectiveSubdivisionLabel}
                        permissionState={holidayOverlay.permissionState}
                        locationRefreshedAt={holidayOverlay.refreshedAt}
                        countriesLoading={holidayOverlay.countriesLoading}
                        subdivisionsLoading={holidayOverlay.subdivisionsLoading}
                        isLocating={holidayOverlay.isLocating}
                        compact
                        showEnabledToggle={false}
                        onEnabledChange={holidayOverlay.setEnabled}
                        onLocationModeChange={holidayOverlay.setLocationMode}
                        onCountryChange={holidayOverlay.setCountryCode}
                        onSubdivisionChange={holidayOverlay.setSubdivisionCode}
                        onUsePreciseLocationChange={(value) => { void holidayOverlay.setUsePreciseLocation(value); }}
                        onRequestPreciseLocation={() => holidayOverlay.requestPreciseLocation()}
                    />
                </Popover.Content>
            </Popover.Root>

            {!shell.isPhone && holidayPromptOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.85rem)] z-30 w-[min(25rem,calc(100vw-2rem))]">
                    <HolidayLocationPrompt
                        isLocating={holidayOverlay.isLocating}
                        onUsePreciseLocation={handleUsePreciseHolidayLocation}
                        onDismiss={handleDismissHolidayPrompt}
                        onDismissPermanently={handleDismissHolidayPromptPermanently}
                        onChooseManual={handleChooseHolidayLocationManually}
                    />
                </div>
            ) : null}

            <Dialog.Dialog open={shell.isPhone && holidayPromptOpen} onOpenChange={(open) => !open && handleDismissHolidayPrompt()}>
                <Dialog.DialogContent className="w-[min(calc(100vw-1.5rem),28rem)] rounded-[2rem] border border-white/[0.08] bg-twilight-deep/96 p-0">
                    <HolidayLocationPrompt
                        isLocating={holidayOverlay.isLocating}
                        onUsePreciseLocation={handleUsePreciseHolidayLocation}
                        onDismiss={handleDismissHolidayPrompt}
                        onDismissPermanently={handleDismissHolidayPromptPermanently}
                        onChooseManual={handleChooseHolidayLocationManually}
                    />
                </Dialog.DialogContent>
            </Dialog.Dialog>
        </div>
    );

    // ── View key for AnimatePresence ────────────────────────────────────────
    const viewKey = viewMode === "month"
        ? `month-${year}-${month}`
        : viewMode === "week"
            ? `week-${toISODate(weekDates[0])}`
            : viewMode === "day"
                ? `day-${currentDate}`
                : `year-${year}`;

    const sidePanel = shell.isWide && selectedTaskId ? (
        <ResizableSidePanel
            defaultWidth={360}
            minWidth={300}
            maxWidth={520}
            ariaLabel="Resize schedule detail panel"
        >
            <TaskEditPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
        </ResizableSidePanel>
    ) : undefined;

    return (
        <MainLayout requireAuth sidePanel={sidePanel}>
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
                <div className="h-full flex flex-col overflow-hidden" onWheel={handleWheel}>
                    {/* Header */}
                    <ScheduleHeader
                        year={year}
                        month={month}
                        currentDate={currentDate}
                        viewMode={viewMode}
                        onViewMode={handleViewMode}
                        onNavigate={handleNavigate}
                        onToday={handleToday}
                        onAddTask={handleAddTaskToolbar}
                        holidayControls={holidayControls}
                        compact={shell.isCompact}
                    />

                    {/* Main calendar area */}
                    <div className="flex-1 min-h-0 relative flex overflow-hidden">
                        {/* Calendar views */}
                        <div className="flex-1 min-w-0 relative overflow-hidden">
                            <AnimatePresence initial={false} custom={direction} mode="wait">
                                <motion.div
                                    key={viewKey}
                                    custom={direction}
                                    variants={slideVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{
                                        x: { type: "spring", stiffness: 320, damping: 32 },
                                        opacity: { duration: 0.18 },
                                    }}
                                    className="absolute inset-0 flex flex-col"
                                >
                                    {/* ── MONTH ── */}
                                    {viewMode === "month" && (
                                        <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4">
                                            <CalendarGrid
                                                year={year}
                                                month={month}
                                                selectedDate={currentDate}
                                                datesWithTasks={datesWithTasks}
                                                habitDays={habitDays}
                                                holidayDays={holidayOverlay.holidaySettings.enabled ? holidayDays : undefined}
                                                birthdayDay={birthdayDay}
                                                onSelectDate={handleSelectDate}
                                                variant="full"
                                                tasksByDay={tasksByDay}
                                                onSelectTask={handleSelectTask}
                                                onCompleteTask={handleCompleteTask}
                                                onArchiveTask={handleArchiveTask}
                                                onContextAdd={handleGridClick}
                                            />
                                        </div>
                                    )}

                                    {/* ── WEEK ── */}
                                    {viewMode === "week" && (
                                        <WeekView
                                            weekDates={weekDates}
                                            tasksByDate={weekTasksByDate}
                                            holidaysByDate={holidayOverlay.holidaySettings.enabled ? holidaysByDateRecord : undefined}
                                            birthdayDate={birthdayDate}
                                            activeDropPreview={activeDropPreview}
                                            onSelectTask={handleSelectTask}
                                            onCompleteTask={handleCompleteTask}
                                            onArchiveTask={handleArchiveTask}
                                            onGridClick={handleGridClick}
                                        />
                                    )}

                                    {/* ── DAY ── */}
                                    {viewMode === "day" && (
                                        <DayView
                                            currentDate={currentDate}
                                            tasks={[...dayTasks, ...virtualHabitTasks]}
                                            holidays={holidayOverlay.holidaySettings.enabled ? (holidaysByDateRecord[currentDate] ?? []) : []}
                                            isBirthday={birthdayDate === currentDate}
                                            activeDropPreview={activeDropPreview}
                                            onSelectTask={handleSelectTask}
                                            onCompleteTask={handleCompleteTask}
                                            onArchiveTask={handleArchiveTask}
                                            onGridClick={handleGridClick}
                                        />
                                    )}

                                    {/* ── YEAR ── */}
                                    {viewMode === "year" && (
                                        <div className="flex-1 min-h-0 p-4">
                                            <YearView
                                                year={year}
                                                tasks={yearTasks}
                                                holidayDateSet={holidayOverlay.holidaySettings.enabled ? holidayOverlay.holidayDateSet : undefined}
                                                birthdayDate={birthdayDate}
                                                onSelectMonth={handleYearSelectMonth}
                                                onSelectDay={handleYearSelectDay}
                                            />
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                    </div>
                </div>

                {/* ── Event creation popover ── */}
                <AnimatePresence>
                    {eventPopoverInfo && (
                        <CalendarEventPopover
                            info={eventPopoverInfo}
                            onClose={() => setEventPopoverInfo(null)}
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
                    title="Task details"
                >
                    <TaskEditPanel taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
                </ResponsiveOverlayPanel>
            )}
        </MainLayout>
    );
}
