import { useState, useRef, useMemo, useCallback } from "react";
import { MainLayout } from "../components/MainLayout";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
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
    parseLocalDate,
} from "../lib/utils/date-format";
import type { Task } from "../types/task";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { useApiClient } from "../hooks/use-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/api/query-keys";
import { toast } from "sonner";

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

const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 32 : -32, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -32 : 32, opacity: 0 }),
};

// ── component ──────────────────────────────────────────────────────────────

export default function Schedule() {
    const today = new Date();
    const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
    const [currentDate, setCurrentDate] = useState<string>(toISODate(today));
    const [direction, setDirection] = useState(0);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
    const [eventPopoverInfo, setEventPopoverInfo] = useState<CalendarEventInfo | null>(null);
    const scrollLockRef = useRef(false);

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
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const taskId = (event.active.data.current as { taskId?: string })?.taskId;
        if (taskId) {
            setActiveDragTask(allVisibleTasks.get(taskId) ?? null);
        }
    }, [allVisibleTasks]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        setActiveDragTask(null);
        const { active, over } = event;
        if (!over) return;

        const taskId = (active.data.current as { taskId?: string })?.taskId;
        if (!taskId) return;

        const droppedId = String(over.id);

        // Zone format: "day-YYYY-MM-DD" or "day-YYYY-MM-DDTHH:MM..."
        if (droppedId.startsWith("day-")) {
            const datePart = droppedId.slice(4); // "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:00Z"
            const isDateTime = datePart.includes("T");
            const task = allVisibleTasks.get(taskId);
            if (!task) return;

            if (isDateTime) {
                // Timed drop in week/day view
                const newStart = datePart;
                const durationMs = task.scheduledEnd && task.scheduledStart
                    ? new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime()
                    : (task.durationEstimate ?? 60) * 60_000;
                const newEnd = new Date(new Date(newStart).getTime() + durationMs).toISOString();
                updateTask({ id: taskId, scheduledStart: newStart, scheduledEnd: newEnd, isAllDay: false });
            } else {
                // Date-only drop in month view.
                // Normalize scheduledStart through Date → toISOString() to guarantee
                // a clean "HH:MM:SS.sssZ" suffix regardless of what Drizzle/Postgres
                // returns (e.g. "2026-02-28 09:00:00+00" with space separator or
                // short +00 tz offset — both fail z.iso.datetime() if passed raw).
                let timeSuffix = "T09:00:00.000Z";
                if (task.scheduledStart) {
                    const normalizedIso = new Date(task.scheduledStart).toISOString();
                    timeSuffix = "T" + normalizedIso.slice(11); // "THH:MM:SS.sssZ" always
                }
                const newStart = task.isAllDay ? null : datePart + timeSuffix;
                updateTask({
                    id: taskId,
                    dueDate: datePart,
                    ...(newStart ? { scheduledStart: newStart } : {}),
                });
            }
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
                queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
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
                queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
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

    return (
        <MainLayout requireAuth>
            <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
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
                    />

                    {/* Main calendar area */}
                    <div className="flex-1 min-h-0 relative flex">
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
                                        <div className="flex-1 min-h-0 p-4 overflow-hidden">
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

                        {/* ── Task Edit Panel side-sheet ── */}
                        <AnimatePresence>
                            {selectedTaskId && (
                                <>
                                    {/* Dim overlay */}
                                    <motion.div
                                        key="dim"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="absolute inset-0 bg-twilight-void/40 backdrop-blur-[2px] z-30"
                                        onClick={() => setSelectedTaskId(null)}
                                    />
                                    {/* Side-sheet */}
                                    <motion.div
                                        key="panel"
                                        initial={{ x: "100%", opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        exit={{ x: "100%", opacity: 0 }}
                                        transition={{ type: "spring", stiffness: 320, damping: 32 }}
                                        className="absolute right-0 top-0 bottom-0 w-96 z-40 glass border-l border-twilight-border"
                                    >
                                        <TaskEditPanel
                                            taskId={selectedTaskId}
                                            onClose={() => setSelectedTaskId(null)}
                                        />
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
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
                <DragOverlay>
                    {activeDragTask && (
                        <CalendarTaskChipOverlay task={activeDragTask} />
                    )}
                </DragOverlay>
            </DndContext>
        </MainLayout>
    );
}
