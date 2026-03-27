import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Check, CheckCircle2, Clock, Flame, Pause } from "lucide-react";

import { useApiClient } from "../../hooks/auth/use-api-client";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useProjects } from "../../hooks/projects/use-projects";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";
import { unwrapResponse } from "../../lib/api/helpers";
import { toISODate } from "../../lib/utils/date-format";
import type { Habit } from "../../types/habit";
import { HabitMenu } from "./HabitMenu";
import { HabitContextMenuWrapper } from "./HabitContextMenuWrapper";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface HabitMonthlyData {
    scheduledDays: number[];
    logsByDay: Record<number, string>;
}

interface HabitsMonthViewProps {
    year: number;
    month: number;
    habits: Habit[];
    selectedHabitId?: string | null;
    onSelectHabit?: (id: string) => void;
    emptyStateMode?: "active" | "archived";
}

function sortHabits(habits: Habit[]): Habit[] {
    const now = new Date();
    return [...habits].sort((a, b) => {
        const aPaused = a.pausedUntil && new Date(a.pausedUntil) > now ? 1 : 0;
        const bPaused = b.pausedUntil && new Date(b.pausedUntil) > now ? 1 : 0;
        if (aPaused !== bPaused) return aPaused - bPaused;

        const aDue = a.isDueToday || a.isOverdue ? 0 : 1;
        const bDue = b.isDueToday || b.isOverdue ? 0 : 1;
        if (aDue !== bDue) return aDue - bDue;

        const aTimed = a.targetTime ? 0 : 1;
        const bTimed = b.targetTime ? 0 : 1;
        if (aTimed !== bTimed) return aTimed - bTimed;

        if (a.targetTime && b.targetTime) return a.targetTime.localeCompare(b.targetTime);
        return a.sortOrder - b.sortOrder;
    });
}

function buildMonthCells(year: number, month: number) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = new Date(year, month, 1).getDay();
    const cells: Array<number | null> = [
        ...Array(firstDow).fill(null),
        ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];

    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    return cells;
}

function MonthCardGrid({
    year,
    month,
    data,
    isLoading,
}: {
    year: number;
    month: number;
    data: HabitMonthlyData | undefined;
    isLoading: boolean;
}) {
    const todayIso = toISODate(new Date());
    const cells = useMemo(() => buildMonthCells(year, month), [year, month]);
    const scheduledDays = new Set(data?.scheduledDays ?? []);
    const logsByDay = data?.logsByDay ?? {};

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-7 gap-1">
                {DOW.map((label) => (
                    <div
                        key={label}
                        className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted/45"
                    >
                        {label}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
                {isLoading
                    ? cells.map((_, index) => (
                        <div
                            key={index}
                            className="aspect-square rounded-[0.85rem] bg-white/[0.04] animate-pulse"
                        />
                    ))
                    : cells.map((day, index) => {
                        if (day === null) {
                            return <div key={index} className="aspect-square" />;
                        }

                        const dayIso = toISODate(new Date(year, month, day));
                        const isToday = dayIso === todayIso;
                        const status = logsByDay[day];
                        const isScheduled = scheduledDays.has(day);
                        const isCompleted = status === "COMPLETED";
                        const isSkipped = status === "SKIPPED";
                        const isMissed = isScheduled && !isCompleted && !isSkipped && dayIso < todayIso;

                        return (
                            <div
                                key={index}
                                className={[
                                    "relative aspect-square rounded-[0.85rem] border flex items-center justify-center transition-colors",
                                    isToday ? "ring-1 ring-accent-primary/45" : "",
                                    isCompleted
                                        ? "border-accent-primary/25 bg-accent-primary/18"
                                        : isSkipped
                                            ? "border-twilight-border/30 bg-white/[0.04]"
                                            : isMissed
                                                ? "border-accent-primary/20 bg-[repeating-linear-gradient(135deg,rgba(232,164,74,0.10)_0_2px,transparent_2px_6px)]"
                                                : isScheduled
                                                    ? "border-white/[0.06] bg-white/[0.03]"
                                                    : "border-transparent bg-transparent opacity-40",
                                ].join(" ")}
                                title={
                                    !isScheduled
                                        ? undefined
                                        : isCompleted
                                            ? "Completed"
                                            : isSkipped
                                                ? "Skipped"
                                                : isMissed
                                                    ? "Missed"
                                                    : "Scheduled"
                                }
                            >
                                {isCompleted ? (
                                    <Check size={11} className="text-accent-primary" strokeWidth={3} />
                                ) : (
                                    <span
                                        className={[
                                            "text-[10px] font-medium tabular-nums",
                                            isToday
                                                ? "text-accent-primary"
                                                : isScheduled
                                                    ? "text-twilight-text-soft"
                                                    : "text-twilight-text-muted/35",
                                        ].join(" ")}
                                    >
                                        {day}
                                    </span>
                                )}
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}

export function HabitsMonthView({
    year,
    month,
    habits,
    selectedHabitId,
    onSelectHabit,
    emptyStateMode = "active",
}: HabitsMonthViewProps) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const { data: projects = [] } = useProjects();
    const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
    const sortedHabits = useMemo(() => sortHabits(habits), [habits]);
    const todayIso = toISODate(new Date());

    const monthlyQueries = useQueries({
        queries: sortedHabits.map((habit) => ({
            queryKey: queryKeys.habits.monthly(habit.id, year, month),
            enabled: authReady && isAuthenticated,
            staleTime: STALE_TIMES.HABITS,
            queryFn: async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const res = await (client as any).api.habits[":id"].monthly.$get({
                    param: { id: habit.id },
                    query: { year: String(year), month: String(month) },
                });
                return unwrapResponse<HabitMonthlyData>(res);
            },
        })),
    });

    const hasMissedDays = sortedHabits.some((habit, index) => {
        const data = monthlyQueries[index]?.data;
        if (!data) return false;

        return data.scheduledDays.some((day) => {
            const dayIso = toISODate(new Date(year, month, day));
            return dayIso < todayIso && !data.logsByDay[day];
        });
    });

    if (habits.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
                <div className="flex h-full flex-col items-center justify-center px-4 py-20 text-center">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-twilight-surface ring-1 ring-twilight-border">
                        <Flame size={24} className="text-accent-primary" />
                    </div>
                    <h3 className="mb-2 text-lg font-medium text-twilight-text">
                        {emptyStateMode === "archived" ? "No archived habits." : "The sanctuary is ready."}
                    </h3>
                    <p className="max-w-sm text-sm text-twilight-text-muted">
                        {emptyStateMode === "archived"
                            ? "Keep up the consistent work across your active routines."
                            : "Add a routine above, then switch back here for a month-level momentum review."}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[1.35rem] border border-twilight-border/30 bg-white/[0.03] px-4 py-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">
                        Month Review
                    </p>
                    <p className="mt-1 text-sm text-twilight-text-soft">
                        Scan consistency, streak energy, and missed days at a glance.
                    </p>
                </div>
                {hasMissedDays ? (
                    <span className="rounded-full border border-accent-primary/20 bg-accent-primary/10 px-3 py-1 text-[11px] font-medium text-accent-primary">
                        Striped cells = missed
                    </span>
                ) : null}
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1 scrollbar-thin">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sortedHabits.map((habit, index) => {
                        const project = habit.projectId ? projectMap.get(habit.projectId) : null;
                        const monthData = monthlyQueries[index]?.data;
                        const isLoading = monthlyQueries[index]?.isLoading ?? false;
                        const isSelected = selectedHabitId === habit.id;
                        const isPaused = Boolean(habit.pausedUntil && new Date(habit.pausedUntil) > new Date());

                        const scheduledDays = monthData?.scheduledDays ?? [];
                        const logsByDay = monthData?.logsByDay ?? {};
                        const completedCount = Object.values(logsByDay).filter((status) => status === "COMPLETED").length;
                        const skippedCount = Object.values(logsByDay).filter((status) => status === "SKIPPED").length;
                        const missedCount = scheduledDays.filter((day) => {
                            const dayIso = toISODate(new Date(year, month, day));
                            return dayIso < todayIso && !logsByDay[day];
                        }).length;
                        const adherence = scheduledDays.length === 0
                            ? 0
                            : Math.round((completedCount / scheduledDays.length) * 100);

                        return (
                            <HabitContextMenuWrapper key={habit.id} habit={habit}>
                            <section
                                className={[
                                    "rounded-[1.65rem] border px-4 py-4 transition-colors",
                                    isPaused ? "opacity-60" : "",
                                    isSelected
                                        ? "border-accent-primary/25 bg-accent-primary/[0.06]"
                                        : "border-twilight-border/35 bg-white/[0.03] hover:bg-white/[0.04]",
                                ].join(" ")}
                            >
                                <div className="flex items-start gap-3">
                                    <button
                                        type="button"
                                        onClick={() => onSelectHabit?.(habit.id)}
                                        className="min-w-0 flex-1 text-left"
                                        aria-label={`View details for ${habit.title}`}
                                        aria-pressed={isSelected}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent-primary shadow-[0_0_6px_color-mix(in_srgb,var(--accent-primary)_45%,transparent)]" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="truncate text-[15px] font-medium text-twilight-text">
                                                        {habit.title}
                                                    </h3>
                                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-primary/20 bg-accent-primary/10 px-2 py-0.5 text-[10px] font-medium text-accent-primary">
                                                        <Flame size={10} />
                                                        {habit.currentStreak}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                    {isPaused ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-twilight-text-muted">
                                                            <Pause size={9} /> Paused
                                                        </span>
                                                    ) : null}
                                                    {habit.targetTime ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-twilight-text-muted">
                                                            <Clock size={9} /> {habit.targetTime}
                                                        </span>
                                                    ) : null}
                                                    {project ? (
                                                        <span className="inline-flex items-center rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-twilight-text-muted">
                                                            {project.name}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </button>

                                    <HabitMenu habit={habit} />
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-twilight-text-soft">
                                        <CheckCircle2 size={11} className="text-accent-primary" />
                                        {completedCount}/{scheduledDays.length || 0} complete
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-twilight-text-soft">
                                        {adherence}% adherence
                                    </span>
                                    {missedCount > 0 ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-accent-primary/16 bg-accent-primary/10 px-2.5 py-1 text-[10px] font-medium text-accent-primary">
                                            {missedCount} missed
                                        </span>
                                    ) : skippedCount > 0 ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-twilight-text-soft">
                                            {skippedCount} skipped
                                        </span>
                                    ) : null}
                                </div>

                                <div className="mt-4 rounded-[1.25rem] border border-twilight-border/25 bg-black/10 p-3">
                                    <MonthCardGrid
                                        year={year}
                                        month={month}
                                        data={monthData}
                                        isLoading={isLoading}
                                    />
                                </div>
                            </section>
                            </HabitContextMenuWrapper>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}