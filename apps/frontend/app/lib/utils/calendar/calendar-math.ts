import type { Task } from "@cadence/contracts/task";
import { addDays, formatInZone, type LocalDate } from "@cadence/domain/time";
import { getDaysInMonth, isoDay } from "../date-format";

/** A LocalDate's year, 0-based month and day-of-month (string parts: a day is never parsed through `Date`). */
export function parseYMD(day: LocalDate): { y: number; m: number; d: number } {
    const [y, m, d] = day.split("-").map(Number);
    return { y, m: m - 1, d };
}

/** The day of the month, 1-31. */
export const dayOfMonth = (day: LocalDate): number => parseYMD(day).d;

/** `day` moved by whole months, its day-of-month clamped to the target month's length. */
export function addMonthsToDay(day: LocalDate, delta: number): LocalDate {
    const { y, m, d } = parseYMD(day);
    const index = y * 12 + m + delta;
    const ny = Math.floor(index / 12);
    const nm = index - ny * 12;
    return isoDay(ny, nm, Math.min(d, getDaysInMonth(ny, nm)));
}

/** `day` moved by whole years (Feb 29 clamps to Feb 28). */
export const addYearsToDay = (day: LocalDate, delta: number): LocalDate => addMonthsToDay(day, delta * 12);

/** Every day of `[start, end]`, inclusive (empty when `end` is before `start`). */
export function daysIn(start: LocalDate, end: LocalDate): LocalDate[] {
    const days: LocalDate[] = [];
    for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
    return days;
}

/** "Monday", "Mon" or "M" for a day. */
export const weekdayName = (day: LocalDate, width: "long" | "short" | "narrow" = "long"): string =>
    formatInZone(day, "UTC", { weekday: width });

/** "Monday 5 October": the day's full label, as the phone surface reads it. */
export const dayHeading = (day: LocalDate): string =>
    `${weekdayName(day)} ${dayOfMonth(day)} ${formatInZone(day, "UTC", { month: "long" })}`;

/** "Mon 5": a short heading for a run of days. */
export const dayShortHeading = (day: LocalDate): string => `${weekdayName(day, "short")} ${dayOfMonth(day)}`;

export function getTaskDurationMs(task: Pick<Task, "scheduledStart" | "scheduledEnd" | "durationEstimate">) {
    if (task.scheduledStart && task.scheduledEnd) {
        return Math.max(30 * 60_000, new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime());
    }
    return Math.max(30, task.durationEstimate ?? 60) * 60_000;
}
