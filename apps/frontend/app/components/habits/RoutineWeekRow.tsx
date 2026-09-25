import type { CSSProperties, MouseEvent } from "react";
import type { Habit, HabitLog } from "@cadence/contracts/habit";
import { routineTimeOn } from "@cadence/domain/repeats";
import { formatShortDate, formatTime, fromTimeValue } from "../../lib/utils/date-format";
import { isRoutinePaused, routineTone } from "../../lib/utils/habits";
import { RoutineDayCell } from "./RoutineDayCell";
import { HabitContextMenu, HabitMenu } from "./HabitMenu";
import { RoutineMark } from "./RoutineMark";

export interface RoutineDay {
    iso: string;
    /** "Mon" */
    short: string;
    /** "M" */
    initial: string;
    dayNum: number;
}

/** Label column, seven days, and (wide) the week's count. Shared by the header row and every routine row. */
export function weekGridColumns(showWeekCount: boolean) {
    return showWeekCount
        ? "grid-cols-[minmax(12rem,18rem)_repeat(7,minmax(2.75rem,1fr))_4.5rem]"
        : "grid-cols-[minmax(10rem,16rem)_repeat(7,minmax(2.75rem,1fr))]";
}

/** Logs keyed by day. */
export function logsByDay(habit: Habit): Map<string, HabitLog> {
    return new Map((habit.logs ?? []).map((log) => [log.targetDate.slice(0, 10), log]));
}

/** A day a check-in can be logged for: scheduled (it has a log) and not in the future. */
export function isLoggable(log: HabitLog | undefined, date: string, today: string) {
    return Boolean(log) && date <= today;
}

/** One quiet line: "7:30 AM · 4 in a row", or "Paused until Sep 30". A streak shows only when it's running. */
export function RoutineMeta({ habit, today, showStreaks }: { habit: Habit; today: string; showStreaks: boolean }) {
    const paused = isRoutinePaused(habit);
    const time = routineTimeOn(habit, today);
    const parts = paused
        ? [`Paused until ${formatShortDate(habit.pausedUntil!)}`]
        : [time ? formatTime(fromTimeValue(today, time)) : null, showStreaks && habit.currentStreak > 0 ? `${habit.currentStreak} in a row` : null];
    const text = parts.filter(Boolean).join(" · ");
    return text ? <span className="block truncate text-xs text-twilight-text-muted">{text}</span> : null;
}

/**
 * A click anywhere on a routine's row or card opens it (or closes it when
 * it's already open), except on its own
 * controls (day cells, the ⋯ menu) and anything portalled out of it.
 */
export function openOnCardClick(onSelect: () => void) {
    return (event: MouseEvent<HTMLElement>) => {
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target) || target.closest("button, a, input, [role=menuitem]")) return;
        onSelect();
    };
}

/** Mark (emoji, or the repeat glyph, tinted by the routine's colour) + title + meta; opens the routine. */
export function RoutineIdentity({ habit, today, showStreaks, selected, onSelect }: {
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
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--routine-tone)_14%,transparent)] text-[var(--routine-tone)]">
                <RoutineMark emoji={habit.emoji} size={16} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium leading-snug text-twilight-text">{habit.title}</span>
                <RoutineMeta habit={habit} today={today} showStreaks={showStreaks} />
            </span>
        </button>
    );
}

/**
 * One routine across a week. Desktop: a grid row under the shared day header
 * (right-click for the routine menu). `stacked` (phone): a card with the
 * weekday initial above each day.
 */
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
    onClose,
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
    onClose: () => void;
}) {
    const toggle = selected ? onClose : onSelect;
    const logs = logsByDay(habit);
    const style = { "--routine-tone": routineTone(habit.colorAccent) } as CSSProperties;
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
            onEdit={onSelect}
        />
    );
    const identity = <RoutineIdentity habit={habit} today={today} showStreaks={showStreaks} selected={selected} onSelect={toggle} />;

    if (stacked) {
        return (
            <section style={style} aria-label={habit.title} onClick={openOnCardClick(toggle)} className={`group cursor-pointer rounded-[1.5rem] border px-3 py-3 transition-colors ${selected ? "border-[color-mix(in_srgb,var(--routine-tone)_30%,transparent)] bg-[color-mix(in_srgb,var(--routine-tone)_6%,transparent)]" : "border-twilight-border/35 bg-white/[0.03]"} ${dim}`}>
                <div className="flex items-center gap-1 pl-1">
                    {identity}
                    <HabitMenu habit={habit} onEdit={onSelect} />
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1">
                    {days.map((day, col) => (
                        <div key={day.iso} className="flex flex-col items-center gap-1">
                            <span aria-hidden="true" className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${day.iso === today ? "text-[var(--routine-tone)]" : "text-twilight-text-muted"}`}>{day.initial}</span>
                            {cell(day, col)}
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    // Only what was done, never "of N": the denominator would be a list of misses.
    const done = days.filter((day) => logs.get(day.iso)?.status === "COMPLETED").length;

    return (
        <HabitContextMenu habit={habit} onEdit={onSelect}>
            <div
                style={style}
                role="row"
                onClick={openOnCardClick(toggle)}
                className={`group grid cursor-pointer ${weekGridColumns(showWeekCount)} items-center rounded-2xl px-2 py-2 transition-colors ${selected ? "bg-[color-mix(in_srgb,var(--routine-tone)_7%,transparent)]" : "hover:bg-white/[0.025]"} ${dim}`}
            >
                <div role="rowheader" className="flex min-w-0 items-center gap-1 pr-2">
                    {identity}
                    <HabitMenu habit={habit} onEdit={onSelect} />
                </div>
                {days.map((day, col) => (
                    <div key={day.iso} role="gridcell" data-today={day.iso === today || undefined} className={`flex justify-center ${day.iso === today ? "-my-2 self-stretch items-center bg-accent-primary/[0.045] py-2" : ""}`}>{cell(day, col)}</div>
                ))}
                {showWeekCount ? (
                    <span role="gridcell" className="text-right text-xs tabular-nums text-twilight-text-muted" aria-label={`${done} done this week`}>
                        {done || ""}
                    </span>
                ) : null}
            </div>
        </HabitContextMenu>
    );
}
