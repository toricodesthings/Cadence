import type { CSSProperties } from "react";
import type { PersonalEvent, SharedEvent } from "@cadence/contracts/personal-event";

export type MaybeSharedEvent = PersonalEvent & Partial<Pick<SharedEvent, "access" | "members">>;
import { PROJECT_ACCENT_OPTIONS } from "../constants/colors";
import { daysBetween, type LocalDate } from "@cadence/domain/time";
import { nextPersonalEventDay, personalEventDay } from "@cadence/domain/reminders";
import { formatMonthName, formatMonthYear, formatShortDate, isoDay } from "./date-format";
import { today as todayDay } from "./user-zone";

const EVENT_DEFAULT_TONE = "var(--accent-nav-schedule)";

export const EVENT_SWATCHES = [
    { value: "", color: EVENT_DEFAULT_TONE, label: "Default" },
    ...PROJECT_ACCENT_OPTIONS.map((option) => ({
        value: option.value as string,
        color: option.varName as string,
        label: option.label as string,
    })),
];

export function eventToneColor(color: string | null | undefined): string | null {
    return PROJECT_ACCENT_OPTIONS.find((option) => option.value === color)?.varName ?? null;
}

export function eventToneStyle(color: string | null | undefined): CSSProperties {
    const tone = eventToneColor(color);
    return (
        tone
            ? {
                  "--event-tone": tone,
                  "--event-ink": `color-mix(in oklab, ${tone} 45%, var(--color-twilight-text))`,
                  "--event-ink-soft": `color-mix(in oklab, ${tone} 30%, var(--color-twilight-text-soft))`,
              }
            : {
                  "--event-tone": EVENT_DEFAULT_TONE,
                  "--event-ink": EVENT_DEFAULT_TONE,
                  "--event-ink-soft": `color-mix(in srgb, ${EVENT_DEFAULT_TONE} 75%, transparent)`,
              }
    ) as CSSProperties;
}

export type PersonalEventSortMode = "next" | "alphabetical" | "month-day" | "reminders";

export interface PersonalEventViewModel {
    event: MaybeSharedEvent;
    nextDate: string;
    nextDateLabel: string;
    countdownLabel: string;
    daysUntil: number;
    monthDayLabel: string;
    milestoneLabel: string | null;
}

export function getNextPersonalEventDate(
    event: Pick<PersonalEvent, "monthDay">,
    today: LocalDate = todayDay(),
): LocalDate {
    return nextPersonalEventDay(event.monthDay, today);
}

export function getPersonalEventCountdownLabel(daysUntil: number) {
    if (daysUntil <= 0) return "Today";
    if (daysUntil === 1) return "Tomorrow";
    return `In ${daysUntil} days`;
}

function getPersonalEventMonthDayLabel(monthDay: string, year = Number(todayDay().slice(0, 4))) {
    return formatShortDate(personalEventDay(monthDay, year));
}

export function getPersonalEventMilestoneLabel(startedOn: string | null | undefined, nextDate: string) {
    if (!startedOn) return null;

    const yearsElapsed = Number(nextDate.slice(0, 4)) - Number(startedOn.slice(0, 4));

    if (yearsElapsed <= 0) {
        return `Started ${formatShortDate(startedOn)}`;
    }

    if (yearsElapsed === 1) {
        return "Marks 1 year";
    }

    return `Marks ${yearsElapsed} years`;
}

export function toPersonalEventViewModel(
    event: MaybeSharedEvent,
    today: LocalDate = todayDay(),
): PersonalEventViewModel {
    const nextDate = getNextPersonalEventDate(event, today);
    const daysUntil = daysBetween(today, nextDate);

    return {
        event,
        nextDate,
        nextDateLabel: formatShortDate(nextDate),
        countdownLabel: getPersonalEventCountdownLabel(daysUntil),
        daysUntil,
        monthDayLabel: getPersonalEventMonthDayLabel(event.monthDay, Number(today.slice(0, 4))),
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

export type PersonalEventView = "cards" | "list";

export function groupPersonalEventsByMonth(
    items: PersonalEventViewModel[],
    mode: PersonalEventSortMode,
    today: LocalDate,
) {
    if (mode !== "next" && mode !== "month-day") return [{ key: "all", label: null, items }];
    const groups: { key: string; label: string | null; items: PersonalEventViewModel[] }[] = [];
    for (const item of items) {
        const day =
            mode === "next"
                ? item.nextDate
                : isoDay(Number(today.slice(0, 4)), Number(item.event.monthDay.slice(0, 2)) - 1, 1);
        const key = day.slice(0, 7);
        const last = groups[groups.length - 1];
        if (last?.key === key) last.items.push(item);
        else
            groups.push({
                key,
                label:
                    mode === "next" && day.slice(0, 4) !== today.slice(0, 4)
                        ? formatMonthYear(day)
                        : formatMonthName(day),
                items: [item],
            });
    }
    return groups;
}
