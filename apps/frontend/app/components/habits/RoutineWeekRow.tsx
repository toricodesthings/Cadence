import type { CSSProperties, MouseEvent } from "react";
import type { Habit, HabitLog } from "@cadence/contracts/habit";
import { routineTimeOn } from "@cadence/domain/repeats";
import { listTimes } from "./RoutineTimes";
import { formatShortDate, formatTime, fromTimeValue } from "../../lib/utils/date-format";
import { isRoutinePaused, routineTone } from "../../lib/utils/habits";
import { RoutineDayCell } from "./RoutineDayCell";
import { HabitContextMenu, HabitMenu } from "./HabitMenu";
import { RoutineMark } from "./RoutineMark";
import { RoutineShareMeta } from "./RoutineShareMeta";
import { DRAGGING, useSortableRoutine } from "./SortableRoutines";

export interface RoutineDay {
    iso: string;
    short: string;
    initial: string;
    dayNum: number;
}

export function weekGridColumns(showWeekCount: boolean) {
    return showWeekCount
        ? "grid-cols-[minmax(12rem,18rem)_repeat(7,minmax(2.75rem,1fr))_4.5rem]"
        : "grid-cols-[minmax(10rem,16rem)_repeat(7,minmax(2.75rem,1fr))]";
}

export function RoutineWeekHeader({
    days,
    today,
    showWeekCount,
    role,
}: {
    days: RoutineDay[];
    today: string;
    showWeekCount: boolean;
    role?: "row";
}) {
    const colRole = role ? "columnheader" : undefined;
    return (
        <div
            role={role}
            className={`photo-shell-surface layer-shell-base sticky top-0 grid ${weekGridColumns(showWeekCount)} items-end rounded-2xl bg-twilight-deep/75 px-2 py-2 backdrop-blur-xl`}
        >
            <span />
            {days.map((day) => {
                const isToday = day.iso === today;
                return (
                    <span key={day.iso} role={colRole} className="flex flex-col items-center gap-1">
                        <span
                            className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isToday ? "text-accent-primary" : "text-twilight-text-soft"}`}
                        >
                            {day.short}
                        </span>
                        <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium tabular-nums ${isToday ? "bg-accent-primary font-semibold text-[var(--primary-foreground)]" : "text-twilight-text"}`}
                        >
                            {day.dayNum}
                        </span>
                    </span>
                );
            })}
            {showWeekCount ? (
                <span role={colRole} className="text-right text-[11px] font-medium text-twilight-text-muted">
                    This week
                </span>
            ) : null}
        </div>
    );
}

export function logsByDay(habit: Habit): Map<string, HabitLog> {
    return new Map((habit.logs ?? []).map((log) => [log.targetDate, log]));
}

export function isLoggable(log: HabitLog | undefined, date: string, today: string) {
    return Boolean(log) && date <= today;
}

export function RoutineMeta({ habit, today, showStreaks }: { habit: Habit; today: string; showStreaks: boolean }) {
    const paused = isRoutinePaused(habit);
    const time = routineTimeOn(habit, today);
    const parts = paused
        ? [`Paused until ${formatShortDate(habit.pausedUntil!)}`]
        : [
              habit.times?.length ? listTimes(habit.times) : time ? formatTime(fromTimeValue(today, time)) : null,
              showStreaks && habit.currentStreak > 0 ? `${habit.currentStreak} in a row` : null,
          ];
    const text = parts.filter(Boolean).join(" · ");
    return text ? <span className="block truncate text-xs text-twilight-text-muted">{text}</span> : null;
}

export function openOnCardClick(onSelect: () => void) {
    return (event: MouseEvent<HTMLElement>) => {
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target) || target.closest("button, a, input, [role=menuitem]")) return;
        onSelect();
    };
}

export function RoutineIdentity({
    habit,
    today,
    showStreaks,
    selected,
    onSelect,
}: {
    habit: Habit;
    today: string;
    showStreaks: boolean;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={`Open ${habit.title}`}
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--routine-tone)]/60"
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--routine-tone)_14%,transparent)] text-[var(--routine-tone)]">
                <RoutineMark emoji={habit.emoji} size={16} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium leading-snug text-twilight-text">
                    {habit.title}
                </span>
                <RoutineMeta habit={habit} today={today} showStreaks={showStreaks} />
                <RoutineShareMeta habit={habit} today={today} />
            </span>
        </button>
    );
}

export function RoutineWeekRow({
    habit,
    days,
    today,
    row,
    stacked,
    selected,
    showStreaks,
    showWeekCount,
    bloom,
    tabIndexFor,
    onSelect,
}: {
    habit: Habit;
    days: RoutineDay[];
    today: string;
    row: number;
    stacked: boolean;
    selected: boolean;
    showStreaks: boolean;
    showWeekCount: boolean;
    bloom: boolean;
    tabIndexFor: (row: number, col: number) => number;
    onSelect: () => void;
}) {
    const logs = logsByDay(habit);
    const sortable = useSortableRoutine(habit);
    const edit = () => {
        if (!selected) onSelect();
    };
    const style = { ...sortable.style, "--routine-tone": routineTone(habit.colorAccent) } as CSSProperties;
    const dim = isRoutinePaused(habit) ? "opacity-60" : "";
    const cell = (day: RoutineDay, col: number) => (
        <RoutineDayCell
            size={stacked ? "sm" : "md"}
            habit={habit}
            date={day.iso}
            log={logs.get(day.iso)}
            today={today}
            bloom={bloom}
            gridPosition={{ row, col }}
            tabIndex={tabIndexFor(row, col)}
            onEdit={edit}
        />
    );
    const identity = (
        <RoutineIdentity
            habit={habit}
            today={today}
            showStreaks={showStreaks}
            selected={selected}
            onSelect={onSelect}
        />
    );

    if (stacked) {
        return (
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- pointer convenience; keyboard path is on the inner controls
            <section
                ref={sortable.ref}
                style={style}
                aria-label={habit.title}
                onClick={openOnCardClick(onSelect)}
                className={`group cursor-pointer rounded-[1.5rem] border px-3 py-3 transition-colors ${selected ? "border-[color-mix(in_srgb,var(--routine-tone)_30%,transparent)] bg-[color-mix(in_srgb,var(--routine-tone)_6%,transparent)]" : "surface-card"} ${sortable.isDragging ? DRAGGING : ""} ${dim}`}
            >
                <div className="flex items-center gap-1">
                    {sortable.grip}
                    {identity}
                    <HabitMenu habit={habit} onEdit={edit} />
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1">
                    {days.map((day, col) => (
                        <div key={day.iso} className="flex flex-col items-center gap-1">
                            <span
                                aria-hidden="true"
                                className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${day.iso === today ? "text-[var(--routine-tone)]" : "text-twilight-text-muted"}`}
                            >
                                {day.initial}
                            </span>
                            {cell(day, col)}
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    const done = days.filter((day) => logs.get(day.iso)?.status === "COMPLETED").length;

    return (
        <HabitContextMenu habit={habit} onEdit={edit}>
            {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- pointer convenience; keyboard path is on the inner controls */}
            <div
                ref={sortable.ref}
                style={style}
                role="row"
                onClick={openOnCardClick(onSelect)}
                className={`group grid cursor-pointer ${weekGridColumns(showWeekCount)} items-center rounded-2xl px-2 py-2 transition-colors ${selected ? "bg-[color-mix(in_srgb,var(--routine-tone)_7%,transparent)]" : "hover:bg-white/[0.025]"} ${sortable.isDragging ? `surface-card ${DRAGGING}` : ""} ${dim}`}
            >
                <div role="rowheader" className="flex min-w-0 items-center gap-1 pr-2">
                    {sortable.grip}
                    {identity}
                    <HabitMenu habit={habit} onEdit={edit} />
                </div>
                {days.map((day, col) => (
                    <div
                        key={day.iso}
                        role="gridcell"
                        data-today={day.iso === today || undefined}
                        className={`flex justify-center ${day.iso === today ? "-my-2 self-stretch items-center bg-accent-primary/[0.045] py-2" : ""}`}
                    >
                        {cell(day, col)}
                    </div>
                ))}
                {showWeekCount ? (
                    <span
                        role="gridcell"
                        className="text-right text-xs tabular-nums text-twilight-text-muted"
                        aria-label={`${done} done this week`}
                    >
                        {done || ""}
                    </span>
                ) : null}
            </div>
        </HabitContextMenu>
    );
}
