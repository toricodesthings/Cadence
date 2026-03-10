import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { MainLayout } from "../components/MainLayout";
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
} from "../lib/utils/date-format";
import type { Task } from "../types/task";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { useApiClient } from "../hooks/use-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/api/query-keys";
import { invalidateEverywhere } from "../lib/api/workspace-cache";
import { toast } from "sonner";
import { useDocumentMeta } from "../hooks/use-document-meta";
import { useShellMode } from "../hooks/use-shell-mode";
import {
    getDateFromTimedDropId,
    parseCalendarTimedDropId,
    type CalendarDropPreview,
} from "../lib/utils/calendar-dnd";
import { MouseSensor, TouchSensor } from "../lib/utils/dnd";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";

// ── helpers ────────────────────────────────────────────────────────────────

function parseYMD(dateStr: string): { y: number; m: number; d: number } {
    const [y, m, d] = dateStr.split("-").map(Number);
    return { y, m: m - 1, d };
}

function addDaysToIso(iso: string, days: number): string {
    const { y, m, d } = parseYMD(iso);
    const dt = new Date(y, m, d + days);
    return toISODate(dt);
}

function addMonthsToIso(iso: string, delta: number): string {
    const { y, m, d } = parseYMD(iso);
    let nm = m + delta;
    let ny = y;
    while (nm > 11) { nm -= 12; ny++; }
    while (nm < 0) { nm += 12; ny--; }
    const maxDay = new Date(ny, nm + 1, 0).getDate();
    return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, maxDay)).padStart(2, "0")}`;
}

function getTaskDurationMs(task: Task) {
    if (task.scheduledStart && task.scheduledEnd) {
        return Math.max(30 * 60_000, new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime());
    }
    return Math.max(30, task.durationEstimate ?? 60) * 60_000;
}

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

    // ── Habits injection ───────────────────────────────────────────────────
    const { data: rawHabits = [] } = useHabitsWeekly({
        start: viewMode === "month" ? monthRange.start.substring(0, 10) : viewMode === "week" ? weekRange.start.substring(0, 10) : viewMode === "day" ? dayRange.start.substring(0, 10) : "",
        end: viewMode === "month" ? monthRange.end.substring(0, 10) : viewMode === "week" ? weekRange.end.substring(0, 10) : viewMode === "day" ? dayRange.end.substring(0, 10) : "",
        enabled: viewMode !== "year"
    });

    const client = useApiClient();
    const queryClient = useQueryClient();

    const virtualHabitTasks = useMemo<Task[]>(() => {
        return rawHabits.flatMap((h) =>
            h.logs?.filter(l => l.status !== "SKIPPED").map(l => {
                const isAllDay = !h.targetTime;
                const scheduledStart = h.targetTime ? `${l.targetDate.substring(0, 10)}T${h.targetTime}:00.000Z` : l.targetDate;

                return {
                    id: `habit-${h.id}--${l.targetDate}`,
                    userId: h.userId,
                    projectId: null,
                    title: h.title,
                    content: h.description,
                    state: l.status === "COMPLETED" ? "COMPLETE" : "ACTIVE",
                    orderIndex: 0,
                    isAllDay,
                    dueDate: l.targetDate,
                    scheduledStart,
                    scheduledEnd: null,
                    durationEstimate: 30, // 30m default for habits if timed
                    timezoneLocked: false,
                    createdAt: h.createdAt,
                    updatedAt: h.updatedAt,
                    priority: 0,
                    isPinned: false,
                    reminderAt: h.reminderEnabled ? "10m" : null,
                    reminderSilenced: !h.reminderEnabled,
                    recurrenceRule: h.recurrenceRule,
                    isHabit: true,
                } as Task;
            }) || []
        );
    }, [rawHabits]);

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
            const d = parseLocalDate(dateStr);
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
            const d = parseLocalDate(dateStr);
            if (d.getFullYear() === year && d.getMonth() === month) {
                habitDaySet.add(d.getDate());
                withTasks.add(d.getDate());
            }
        }
        return { datesWithTasks: withTasks, tasksByDay: byDay, habitDays: habitDaySet };
    }, [monthTasks, year, month, virtualHabitTasks]);

    // ── Group week tasks by ISO date string ─────────────────────────────────
    const weekTasksByDate = useMemo(() => {
        const map: Record<string, Task[]> = {};
        for (const t of weekTasks) {
            const dateStr = t.scheduledStart ?? t.dueDate;
            if (!dateStr) continue;
            // parseLocalDate avoids the UTC-midnight off-by-one for date-only strings
            const iso = toISODate(parseLocalDate(dateStr));
            if (!map[iso]) map[iso] = [];
            map[iso].push(t);
        }
        for (const h of virtualHabitTasks) {
            const dateStr = h.scheduledStart ?? h.dueDate;
            if (!dateStr) continue;
            const iso = toISODate(parseLocalDate(dateStr));
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
        if (!task || task.isHabit) {
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
        if (!task || task.isHabit) return;

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

            const normalizedIso = new Date(task.scheduledStart).toISOString();
            const preservedStart = `${datePart}T${normalizedIso.slice(11)}`;
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
        setSelectedTaskId(taskId);
    }, []);

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
        updateTask({ id: taskId, state: "COMPLETE" });
    }, [updateTask, client, queryClient]);

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
        updateTask({ id: taskId, state: "ARCHIVED" });
    }, [updateTask, client, queryClient]);

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
