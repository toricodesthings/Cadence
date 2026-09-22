import React, { useEffect, useMemo, useRef } from "react";
import { CalendarCheck, CalendarRange, CalendarX, Clock, Play, X } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { useDebouncedCallback } from "../../hooks/core/use-debounced-callback";
import { DateOnlyPickerPopover } from "./DateOnlyPickerPopover";
import { TimePicker, Tip } from "../primitives";
import { formatShortDate, fromTimeValue, parseLocalDate, toISODate, toTimeValue } from "../../lib/utils/date-format";

/**
 * Direct editor for recurring timetable blocks (Fixed).
 * The generic schedule popover only edits the anchor date and start time —
 * this surface owns the block's start time, end time and repeat weekdays so
 * mistakes (e.g. 3:55 AM instead of PM) are one tap to fix.
 */

const DAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

type RRulePart = [string, string];

function parseRuleParts(rule: string): RRulePart[] {
    return rule
        .split(";")
        .map((part) => part.split("="))
        .filter((part): part is RRulePart => part.length === 2);
}

function joinRuleParts(parts: RRulePart[]): string {
    return parts.map(([key, value]) => `${key}=${value}`).join(";");
}

/** RRULE UNTIL → local "YYYY-MM-DD". Returns null when the series runs forever. */
function parseUntilDate(rule: string | null): string | null {
    const raw = parseRuleParts(rule ?? "").find(([key]) => key === "UNTIL")?.[1];
    if (!raw) return null;
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    if (!/^\d{8}(T\d{6}Z?)?$/.test(raw)) return null;
    // Date-only UNTIL is UTC-midnight by spec; datetime UNTIL is an instant.
    const iso = raw.length === 8 ? `${y}-${m}-${d}T00:00:00.000Z` : `${y}-${m}-${d}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}.000Z`;
    return toISODate(new Date(iso));
}

/** Local "YYYY-MM-DD" → RRULE UNTIL as end-of-day UTC (inclusive of that date). */
function formatUntilValue(dateOnly: string): string {
    const end = parseLocalDate(dateOnly);
    end.setHours(23, 59, 59, 999);
    // "2026-09-18T23:59:59.999Z" → "20260918T235959Z"
    return end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Move an ISO timestamp by whole days, preserving time-of-day. */
function shiftByDays(iso: string, days: number): string {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString();
}

/** "HH:mm" from the primitive → full ISO, using the base timestamp's date (null-safe for closures). */
function fromTimeOnBase(baseIso: string | null, time: string): string {
    if (!baseIso) return time;
    return fromTimeValue(baseIso, time);
}

/** Place `timeSource`'s time-of-day on `anchor`'s date; roll to the next day when the block crosses midnight. */
function alignEndToStart(anchorStart: Date, timeSource: Date): Date {
    const end = new Date(anchorStart);
    end.setHours(timeSource.getHours(), timeSource.getMinutes(), 0, 0);
    if (end <= anchorStart) end.setDate(end.getDate() + 1);
    return end;
}

function formatDuration(startIso: string, endIso: string): string {
    const minutes = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const base = hours > 0 && mins > 0 ? `${hours}h ${mins}m` : hours > 0 ? `${hours}h` : `${mins}m`;
    const crossesMidnight = new Date(endIso).getDate() !== new Date(startIso).getDate()
        || new Date(endIso).getMonth() !== new Date(startIso).getMonth();
    return crossesMidnight ? `${base} · ends next day` : base;
}

const DAY_CHIP_BASE =
    "flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg border text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";
const DAY_CHIP_ACTIVE = "border-moonlit/30 bg-moonlit/15 text-moonlit";
const DAY_CHIP_IDLE = "border-twilight-border/30 text-twilight-text-muted hover:bg-white/[0.05] hover:text-twilight-text";

const ROW_LABEL = "flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-twilight-text-muted/90";

const ROW_ICON = "shrink-0 opacity-80";
const ROW_ICON_SIZE = 11;

const DATE_VALUE_BTN =
    "flex min-h-10 max-w-full cursor-pointer items-center rounded-lg px-2.5 text-right text-[13px] text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

interface TimetableBlockEditorProps {
    task: Pick<Task, "id" | "scheduledStart" | "scheduledEnd" | "recurrenceRule">;
}

export const TimetableBlockEditor: React.FC<TimetableBlockEditorProps> = ({ task }) => {
    const updateTask = useUpdateTask();

    // Latest intended times. Props lag by a full mutation round-trip, so both
    // handlers must chain off this ref — otherwise an end edit made inside the
    // debounce window would be computed from (and commit) the stale start.
    const latestTimesRef = useRef<{ start: string | null; end: string | null }>({
        start: task.scheduledStart ?? null,
        end: task.scheduledEnd ?? null,
    });
    const lastSentRef = useRef<string | null>(null);

    useEffect(() => {
        latestTimesRef.current = { start: task.scheduledStart ?? null, end: task.scheduledEnd ?? null };
    }, [task.scheduledStart, task.scheduledEnd]);

    // Reads the ref at fire time, so an immediate mutation (add/clear end) that
    // lands first can't be resurrected by a pending commit carrying the old end.
    const commitTimes = useDebouncedCallback(() => {
        const { start, end } = latestTimesRef.current;
        if (!start) return;
        const key = `${start}|${end ?? ""}`;
        if (key === lastSentRef.current) return;
        lastSentRef.current = key;
        updateTask.mutate({ id: task.id, scheduledStart: start, scheduledEnd: end, isAllDay: false });
    }, 400);

    const handleStartChange = (iso: string) => {
        if (!latestTimesRef.current.start) return;
        const start = new Date(iso);
        // Keep the block's length: re-anchor the end's time-of-day onto the new start.
        const end = latestTimesRef.current.end ? alignEndToStart(start, new Date(latestTimesRef.current.end)) : null;
        latestTimesRef.current = { start: start.toISOString(), end: end ? end.toISOString() : null };
        commitTimes();
    };

    const handleEndChange = (iso: string) => {
        const anchor = latestTimesRef.current.start;
        if (!anchor) return;
        // The end's calendar date is derived, never picked directly: the chosen
        // time-of-day lands on the start day, rolling over midnight only when needed.
        const end = alignEndToStart(new Date(anchor), new Date(iso));
        latestTimesRef.current = { start: anchor, end: end.toISOString() };
        commitTimes();
    };

    const sendImmediate = (start: string | null, end: string | null) => {
        if (!start) return;
        latestTimesRef.current = { start, end };
        lastSentRef.current = `${start}|${end ?? ""}`;
        updateTask.mutate({ id: task.id, scheduledStart: start, scheduledEnd: end, isAllDay: false });
    };

    const handleAddEnd = () => {
        const anchor = latestTimesRef.current.start;
        if (!anchor) return;
        const end = new Date(new Date(anchor).getTime() + 60 * 60 * 1000);
        sendImmediate(anchor, end.toISOString());
    };

    const handleClearEnd = () => {
        sendImmediate(latestTimesRef.current.start, null);
    };

    /** Re-anchor the series to a new start date, preserving times and block length. */
    const handleSeriesStartDate = (dateOnly: string | null) => {
        if (!dateOnly) return;
        const current = latestTimesRef.current.start;
        if (!current) return;
        const currentStart = new Date(current);
        const nextStart = new Date(currentStart);
        const anchor = parseLocalDate(dateOnly);
        nextStart.setFullYear(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
        const dayDelta = Math.round((nextStart.getTime() - currentStart.getTime()) / 86400000);
        if (dayDelta === 0) return;
        const nextEnd = latestTimesRef.current.end ? shiftByDays(latestTimesRef.current.end, dayDelta) : null;
        sendImmediate(nextStart.toISOString(), nextEnd);
    };

    /** Set or clear the series end date (RRULE UNTIL, inclusive). */
    const handleSeriesEndDate = (dateOnly: string | null) => {
        if (!ruleParts || !task.recurrenceRule) return;
        const parts = ruleParts.filter(([key]) => key !== "UNTIL");
        if (dateOnly) parts.push(["UNTIL", formatUntilValue(dateOnly)]);
        updateTask.mutate({ id: task.id, recurrenceRule: joinRuleParts(parts) });
    };

    const ruleParts = useMemo(
        () => (task.recurrenceRule ? parseRuleParts(task.recurrenceRule) : null),
        [task.recurrenceRule],
    );
    const freq = ruleParts?.find(([key]) => key === "FREQ")?.[1] ?? null;
    const explicitDays = ruleParts?.find(([key]) => key === "BYDAY")?.[1]?.split(",").filter(Boolean) ?? null;
    // A weekly rule without BYDAY repeats on the anchor's weekday — show it as the active chip.
    const anchorDay = task.scheduledStart
        ? DAY_ORDER[(new Date(task.scheduledStart).getDay() + 6) % 7]
        : "MO";
    const activeDays = new Set(explicitDays ?? [anchorDay]);

    const toggleDay = (day: string) => {
        if (!ruleParts || !task.recurrenceRule) return;
        const next = new Set(activeDays);
        if (next.has(day)) {
            if (next.size === 1) return; // a block must keep at least one day
            next.delete(day);
        } else {
            next.add(day);
        }
        const value = DAY_ORDER.filter((d) => next.has(d)).join(",");
        const index = ruleParts.findIndex(([key]) => key === "BYDAY");
        const parts = [...ruleParts];
        if (index >= 0) parts[index] = ["BYDAY", value];
        else parts.push(["BYDAY", value]);
        updateTask.mutate({ id: task.id, recurrenceRule: joinRuleParts(parts) });
    };

    if (!task.scheduledStart) return null;

    const durationLabel = task.scheduledEnd ? formatDuration(task.scheduledStart, task.scheduledEnd) : null;
    const startDateLabel = formatShortDate(task.scheduledStart);
    const endDate = parseUntilDate(task.recurrenceRule ?? null);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                    <span className={ROW_LABEL}>
                        <Play size={ROW_ICON_SIZE} className={ROW_ICON} aria-hidden="true" />
                        Starts
                    </span>
                    <TimePicker
                        value={toTimeValue(task.scheduledStart)}
                        onChange={(t) => handleStartChange(fromTimeOnBase(task.scheduledStart, t))}
                    />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className={ROW_LABEL}>
                        <Clock size={ROW_ICON_SIZE} className={ROW_ICON} aria-hidden="true" />
                        Ends
                    </span>
                    {task.scheduledEnd ? (
                        <div className="relative">
                            <TimePicker
                                value={toTimeValue(task.scheduledEnd)}
                                onChange={(t) => handleEndChange(fromTimeOnBase(task.scheduledEnd, t))}
                            />
                            <Tip label="Remove end time" side="left">
                                <button
                                    type="button"
                                    onClick={handleClearEnd}
                                    aria-label="Remove end time"
                                    className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 cursor-pointer items-center justify-center rounded-full border border-feedback-error/40 bg-feedback-error/15 text-feedback-error transition-colors hover:bg-feedback-error/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-feedback-error/50"
                                >
                                    <X size={10} aria-hidden="true" />
                                </button>
                            </Tip>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleAddEnd}
                            className="min-h-10 cursor-pointer rounded-lg px-2.5 text-[13px] text-accent-primary transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            Add end time
                        </button>
                    )}
                </div>
                {durationLabel ? (
                    <p className="px-0.5 text-right text-[11px] tabular-nums text-twilight-text-muted/90" aria-live="polite">
                        {durationLabel}
                    </p>
                ) : null}
            </div>

            {freq === "WEEKLY" ? (
                <div className="flex flex-col gap-1.5" role="group" aria-label="Repeat days">
                    <span className={ROW_LABEL}>
                        <CalendarRange size={ROW_ICON_SIZE} className={ROW_ICON} aria-hidden="true" />
                        On
                    </span>
                    <div className="flex gap-1">
                        {DAY_ORDER.map((day, index) => (
                            <button
                                key={day}
                                type="button"
                                aria-pressed={activeDays.has(day)}
                                aria-label={`Repeat on ${day}`}
                                onClick={() => toggleDay(day)}
                                className={`${DAY_CHIP_BASE} ${activeDays.has(day) ? DAY_CHIP_ACTIVE : DAY_CHIP_IDLE}`}
                            >
                                {DAY_LETTERS[index]}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="flex flex-col gap-0.5">
                <div className="flex min-h-10 items-center justify-between gap-3">
                    <span className={ROW_LABEL}>
                        <CalendarCheck size={ROW_ICON_SIZE} className={ROW_ICON} aria-hidden="true" />
                        Starts on
                    </span>
                    <DateOnlyPickerPopover
                        value={toISODate(parseLocalDate(task.scheduledStart))}
                        onChange={handleSeriesStartDate}
                        label="Series start date"
                    >
                        <button type="button" className={DATE_VALUE_BTN}>
                            {startDateLabel}
                        </button>
                    </DateOnlyPickerPopover>
                </div>
                <div className="flex min-h-10 items-center justify-between gap-3">
                    <span className={ROW_LABEL}>
                        <CalendarX size={ROW_ICON_SIZE} className={ROW_ICON} aria-hidden="true" />
                        Ends on
                    </span>
                    <DateOnlyPickerPopover
                        value={endDate}
                        onChange={handleSeriesEndDate}
                        label="Series end date"
                        clearLabel="Never ends"
                    >
                        <button type="button" className={`${DATE_VALUE_BTN}${endDate ? "" : " text-twilight-text-muted"}`}>
                            {endDate ? formatShortDate(endDate) : "Never"}
                        </button>
                    </DateOnlyPickerPopover>
                </div>
            </div>
        </div>
    );
};
