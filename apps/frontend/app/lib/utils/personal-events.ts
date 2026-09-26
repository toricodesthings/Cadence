import type { CSSProperties } from "react";
import type { PersonalEvent } from "../../types/settings";
import { PROJECT_ACCENT_OPTIONS } from "../constants/colors";
import { formatShortDate, toISODate } from "./date-format";

const EVENT_DEFAULT_TONE = "var(--accent-nav-schedule)";

/** Colour choices for an event: no colour (the schedule tint) first, then the list palette. "" means none. */
export const EVENT_SWATCHES = [
    { value: "", color: EVENT_DEFAULT_TONE, label: "Default" },
    ...PROJECT_ACCENT_OPTIONS.map((option) => ({ value: option.value as string, color: option.varName as string, label: option.label as string })),
];

/** An event's picked tint, or null for none (and for keys no longer in the palette). */
export function eventToneColor(color: string | null | undefined): string | null {
    return PROJECT_ACCENT_OPTIONS.find((option) => option.value === color)?.varName ?? null;
}

/**
 * CSS vars for an event's look. `--event-tone` tints surfaces; `--event-ink` and `--event-ink-soft`
 * colour text. A picked colour is blended in oklab toward the theme's own text colour, so text keeps
 * AA contrast in every theme (raw palette colours drop near 2:1 on Daylight). No colour keeps the schedule tint.
 */
export function eventToneStyle(color: string | null | undefined): CSSProperties {
    const tone = eventToneColor(color);
    return (tone
        ? { "--event-tone": tone, "--event-ink": `color-mix(in oklab, ${tone} 45%, var(--color-twilight-text))`, "--event-ink-soft": `color-mix(in oklab, ${tone} 30%, var(--color-twilight-text-soft))` }
        : { "--event-tone": EVENT_DEFAULT_TONE, "--event-ink": EVENT_DEFAULT_TONE, "--event-ink-soft": `color-mix(in srgb, ${EVENT_DEFAULT_TONE} 75%, transparent)` }) as CSSProperties;
}

export type PersonalEventSortMode = "next" | "alphabetical" | "month-day" | "reminders";

export interface PersonalEventViewModel {
    event: PersonalEvent;
    nextDate: string;
    nextDateLabel: string;
    countdownLabel: string;
    daysUntil: number;
    monthDayLabel: string;
    milestoneLabel: string | null;
}

export function getNormalizedMonthDay(monthDay: string, year: number) {
    const [rawMonth, rawDay] = monthDay.split("-").map((value) => Number.parseInt(value, 10));
    const month = Number.isFinite(rawMonth) ? Math.min(Math.max(rawMonth, 1), 12) : 1;
    const maxDay = new Date(year, month, 0).getDate();
    const day = Number.isFinite(rawDay) ? Math.min(Math.max(rawDay, 1), maxDay) : 1;

    return {
        month,
        day,
        monthDay: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    };
}

function getPersonalEventOccurrenceDate(monthDay: string, year: number) {
    const normalized = getNormalizedMonthDay(monthDay, year);
    return `${year}-${String(normalized.month).padStart(2, "0")}-${String(normalized.day).padStart(2, "0")}`;
}

export function getNextPersonalEventDate(event: Pick<PersonalEvent, "monthDay">, today = new Date()) {
    const todayIso = toISODate(today);
    const thisYearDate = getPersonalEventOccurrenceDate(event.monthDay, today.getFullYear());
    if (thisYearDate >= todayIso) return thisYearDate;
    return getPersonalEventOccurrenceDate(event.monthDay, today.getFullYear() + 1);
}

export function getPersonalEventCountdownLabel(daysUntil: number) {
    if (daysUntil <= 0) return "Today";
    if (daysUntil === 1) return "Tomorrow";
    return `In ${daysUntil} days`;
}

function getPersonalEventMonthDayLabel(monthDay: string, year = new Date().getFullYear()) {
    return formatShortDate(getPersonalEventOccurrenceDate(monthDay, year));
}

export function getPersonalEventMilestoneLabel(startedOn: string | null | undefined, nextDate: string) {
    if (!startedOn) return null;

    const startDate = new Date(`${startedOn}T00:00:00`);
    const occurrenceDate = new Date(`${nextDate}T00:00:00`);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(occurrenceDate.getTime())) {
        return null;
    }

    const yearsElapsed = occurrenceDate.getFullYear() - startDate.getFullYear();

    if (yearsElapsed <= 0) {
        return `Started ${formatShortDate(startedOn)}`;
    }

    if (yearsElapsed === 1) {
        return "Marks 1 year";
    }

    return `Marks ${yearsElapsed} years`;
}

export function toPersonalEventViewModel(event: PersonalEvent, today = new Date()): PersonalEventViewModel {
    const todayIso = toISODate(today);
    const nextDate = getNextPersonalEventDate(event, today);
    const daysUntil = Math.round((new Date(`${nextDate}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86_400_000);

    return {
        event,
        nextDate,
        nextDateLabel: formatShortDate(nextDate),
        countdownLabel: getPersonalEventCountdownLabel(daysUntil),
        daysUntil,
        monthDayLabel: getPersonalEventMonthDayLabel(event.monthDay),
        milestoneLabel: getPersonalEventMilestoneLabel(event.startedOn, nextDate),
    };
}

export function sortPersonalEventViewModels(items: PersonalEventViewModel[], mode: PersonalEventSortMode) {
    const sorted = [...items];

    sorted.sort((a, b) => {
        switch (mode) {
            case "alphabetical":
                return a.event.label.localeCompare(b.event.label);
            case "month-day":
                if (a.event.monthDay !== b.event.monthDay) return a.event.monthDay.localeCompare(b.event.monthDay);
                return a.event.label.localeCompare(b.event.label);
            case "reminders":
                if (a.event.notify !== b.event.notify) return a.event.notify ? -1 : 1;
                if (a.nextDate !== b.nextDate) return a.nextDate.localeCompare(b.nextDate);
                return a.event.label.localeCompare(b.event.label);
            case "next":
            default:
                if (a.nextDate !== b.nextDate) return a.nextDate.localeCompare(b.nextDate);
                return a.event.label.localeCompare(b.event.label);
        }
    });

    return sorted;
}
