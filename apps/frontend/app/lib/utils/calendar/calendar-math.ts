import { addDays, formatInZone, type LocalDate } from "@cadence/domain/time";
import { getDaysInMonth, isoDay } from "../date-format";

export function parseYMD(day: LocalDate): { y: number; m: number; d: number } {
    const [y, m, d] = day.split("-").map(Number);
    return { y, m: m - 1, d };
}

export const dayOfMonth = (day: LocalDate): number => parseYMD(day).d;

export function addMonthsToDay(day: LocalDate, delta: number): LocalDate {
    const { y, m, d } = parseYMD(day);
    const index = y * 12 + m + delta;
    const ny = Math.floor(index / 12);
    const nm = index - ny * 12;
    return isoDay(ny, nm, Math.min(d, getDaysInMonth(ny, nm)));
}

export const addYearsToDay = (day: LocalDate, delta: number): LocalDate => addMonthsToDay(day, delta * 12);

export function daysIn(start: LocalDate, end: LocalDate): LocalDate[] {
    const days: LocalDate[] = [];
    for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
    return days;
}

export const weekdayName = (day: LocalDate, width: "long" | "short" | "narrow" = "long"): string =>
    formatInZone(day, "UTC", { weekday: width });

export const dayHeading = (day: LocalDate): string =>
    `${weekdayName(day)} ${dayOfMonth(day)} ${formatInZone(day, "UTC", { month: "long" })}`;

export const dayShortHeading = (day: LocalDate): string => `${weekdayName(day, "short")} ${dayOfMonth(day)}`;
