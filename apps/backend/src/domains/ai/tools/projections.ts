/**
 * Pure, token-frugal projection helpers shared by the read tools.
 *
 * These map full DB rows down to the minimal id + status fields the model needs
 * (doc 05 §1.4 "token frugality") — NEVER full `content`/`notes`/markdown bodies.
 * They are pure functions (no DB, no env) so they are unit-tested directly in
 * `tests/unit/ai-tools.test.ts`.
 */

import type { HabitRow as HabitRecord } from "@cadence/contracts/habit";
import type { InboxItemRow as InboxItemRecord } from "@cadence/contracts/inbox";
import type { ProjectRow as ProjectRecord } from "@cadence/contracts/project";
import type { SubtaskRow as SubtaskRecord } from "@cadence/contracts/subtask";
import type { TagRow as TagRecord } from "@cadence/contracts/tag";
import type { TaskRow as TaskRecord } from "@cadence/contracts/task";
import { isPausedOn } from "@cadence/domain/repeats";
import { taskDay } from "@cadence/domain/task-recurrence";
import { addDays, monthRange, toZonedIso, weekRange, type WeekStart } from "@cadence/domain/time";
import { NOTE_READ_LIMIT } from "./drafts";

/**
 * A minimal task row as projected for the model. Keys at their default are left
 * out (no priority, effort, list, waiting, Fixed or repeat → no key), and so is
 * isAllDay: a day without a start is all-day, a start is a timed block.
 */
export interface MinimalTask {
    id: string;
    title: string;
    /** Left out for an active Fixed block: it just passes, so "ACTIVE" would read as not done yet. */
    state?: string;
    /** The day it sits on, or its deadline (YYYY-MM-DD). */
    dueDate?: string;
    /** An all-day multi-day task's last day (YYYY-MM-DD). */
    endDate?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
    durationEstimate?: number;
    priority?: number;
    effort?: number;
    projectId?: string;
    sectionId?: string;
    /** The list's and section's names, for matching how the user recalls it. */
    list?: string;
    section?: string;
    waitingOn?: string;
    /** A timetable block (class, shift): occupies time, can't be checked off, never overdue. */
    fixedBlock?: true;
    /** Part of a repeating series; `id` is the series id. */
    repeats?: true;
    tagIds?: string[];
    pinned?: true;
    /** When Cadence reminds the user, local time with offset. */
    reminderAt?: string;
    /** A Waiting task's check-in, local time with offset. */
    checkInAt?: string;
    /** Hidden from lists until this local day. */
    hiddenUntil?: string;
}

/** The task columns the projection reads (a full row fits; `content` is dropped). */
export type TaskRow = Pick<
    TaskRecord,
    | "id" | "title" | "state" | "dueDate" | "scheduledStart" | "scheduledEnd"
    | "durationEstimate" | "priority" | "effort" | "projectId" | "waitingOn" | "interactionMode" | "recurrenceRule"
> & Partial<Pick<TaskRecord, "endDate" | "sectionId" | "content" | "isPinned" | "reminderAt" | "waitingReminder" | "notBefore">> & {
    /** Set on an expanded occurrence of a repeating task (see expandScheduleScopedTasks). */
    seriesId?: string;
    tagIds?: string[];
    listName?: string | null;
    sectionName?: string | null;
};

/**
 * Project a task row to its minimal, token-frugal shape. Drops `content`.
 * Dates are written the way the user reads them, so the model never converts:
 * days as stored ("2026-03-10"), instants as the user's wall clock with offset
 * ("2026-03-10T14:00:00-04:00").
 */
export function toMinimalTask(row: TaskRow, timezone: string): MinimalTask {
    const show = (value: string | null) => (value === null ? undefined : toZonedIso(value, timezone));
    // Unset fields are undefined, which JSON leaves out, so they cost nothing on the wire.
    return {
        // An expanded occurrence's id is "<series>::<start>"; the model acts on the series.
        id: row.seriesId ?? row.id,
        title: row.title,
        state: row.interactionMode === "timetable" && row.state === "ACTIVE" ? undefined : row.state,
        dueDate: row.dueDate ?? undefined,
        endDate: row.endDate ?? undefined,
        scheduledStart: show(row.scheduledStart),
        scheduledEnd: show(row.scheduledEnd),
        durationEstimate: row.durationEstimate ?? undefined,
        priority: row.priority || undefined,
        effort: row.effort ?? undefined,
        projectId: row.projectId ?? undefined,
        sectionId: row.sectionId ?? undefined,
        list: row.listName ?? undefined,
        section: row.sectionName ?? undefined,
        waitingOn: row.waitingOn ?? undefined,
        fixedBlock: row.interactionMode === "timetable" || undefined,
        repeats: !!row.recurrenceRule || undefined,
        tagIds: row.tagIds?.length ? row.tagIds : undefined,
        pinned: row.isPinned || undefined,
        reminderAt: row.reminderAt ? toZonedIso(row.reminderAt, timezone) : undefined,
        checkInAt: row.waitingReminder ? toZonedIso(row.waitingReminder, timezone) : undefined,
        hiddenUntil: row.notBefore ?? undefined,
    };
}

export type MinimalSubtask = Pick<SubtaskRecord, "id" | "title" | "isComplete">;

export function toMinimalSubtask(row: MinimalSubtask): MinimalSubtask {
    return { id: row.id, title: row.title, isComplete: row.isComplete };
}

export type MinimalTag = Pick<TagRecord, "id" | "name" | "color">;

export function toMinimalTag(row: MinimalTag): MinimalTag {
    return { id: row.id, name: row.name, color: row.color };
}

export type ProjectRow = Pick<ProjectRecord, "id" | "name" | "emoji" | "colorAccent">;

export type MinimalProject = ProjectRow & { sections: { id: string; name: string }[] };

/** A list with its sections (board columns), in order. */
export function toMinimalProject(
    row: ProjectRow,
    sections: { id: string; name: string; projectId: string | null }[] = [],
): MinimalProject {
    return {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        colorAccent: row.colorAccent,
        sections: sections.filter((s) => s.projectId === row.id).map(({ id, name }) => ({ id, name })),
    };
}

export interface MinimalHabit {
    id: string;
    title: string;
    /** The routine's mark; left out when it has none. */
    emoji?: string;
    recurrenceRule: string;
    /** Usual local time HH:MM; left out for any time. */
    targetTime?: string;
    /** Weekday → HH:MM where a day differs from targetTime ("" = any time that day). */
    dayTimes?: Record<string, string>;
    colorAccent?: string;
    projectId?: string;
    tagIds?: string[];
    steps?: { id: string; title: string }[];
    currentStreak: number;
    longestStreak: number;
    /** Share of the last 30 days' due days that were done (skipped days don't count), 0..1, 2dp; left out with none due. */
    adherence?: number;
    /** Due days in the last 30 with nothing logged. */
    missedLast30?: number;
    archived: boolean;
    /** True when the habit is paused on/through `currentDate` (caller-derived). */
    paused: boolean;
}

export type HabitRow = Pick<
    HabitRecord,
    "id" | "title" | "recurrenceRule" | "currentStreak" | "longestStreak" | "archived" | "pausedUntil"
> & Partial<Pick<HabitRecord, "emoji" | "targetTime" | "steps" | "targetTimes" | "colorAccent" | "projectId">> & { tagIds?: string[] };

/**
 * Project a routine. `recent` is its last 30 days before today (from `habitDays`):
 * adherence = done / (done + missed), skipped days neutral, so a day nobody
 * logged counts against it (the stored totals never see those). `currentDate`
 * (YYYY-MM-DD) sets the `paused` flag (paused from today through `pausedUntil`).
 */
export function toMinimalHabit(row: HabitRow, currentDate: string, recent?: { done: number; missed: number }): MinimalHabit {
    const counted = recent ? recent.done + recent.missed : 0;
    const paused = isPausedOn(row.pausedUntil, currentDate, currentDate);
    return {
        id: row.id,
        title: row.title,
        emoji: row.emoji ?? undefined,
        recurrenceRule: row.recurrenceRule,
        targetTime: row.targetTime || undefined,
        dayTimes: row.targetTimes && Object.keys(row.targetTimes).length ? row.targetTimes : undefined,
        // "lantern" is the default colour, left out like other defaults.
        colorAccent: row.colorAccent && row.colorAccent !== "lantern" ? row.colorAccent : undefined,
        projectId: row.projectId ?? undefined,
        tagIds: row.tagIds?.length ? row.tagIds : undefined,
        steps: row.steps?.length ? row.steps.map(({ id, title }) => ({ id, title })) : undefined,
        currentStreak: row.currentStreak,
        longestStreak: row.longestStreak,
        adherence: counted ? Math.round((recent!.done / counted) * 100) / 100 : undefined,
        missedLast30: recent?.missed || undefined,
        archived: row.archived,
        paused,
    };
}

export type InboxItemRow = Pick<InboxItemRecord, "id" | "rawText" | "captureKind" | "captureStatus" | "processed"> &
    Partial<Pick<InboxItemRecord, "placedTaskId">>;

export type MinimalInboxItem = Omit<InboxItemRow, "placedTaskId"> & { isNote: boolean; truncated?: true; taskId?: string };

/** Project an inbox capture: the user's own words, verbatim up to the note read limit (truncated:true past it). */
export function toMinimalInboxItem(row: InboxItemRow): MinimalInboxItem {
    return {
        isNote: row.captureStatus === "kept",
        id: row.id,
        rawText: row.rawText.slice(0, NOTE_READ_LIMIT),
        ...(row.rawText.length > NOTE_READ_LIMIT && { truncated: true as const }),
        captureKind: row.captureKind,
        captureStatus: row.captureStatus,
        processed: row.processed,
        // The task it became, for Undo ("put it back in Capture").
        taskId: row.placedTaskId ?? undefined,
    };
}

/**
 * The calendar day a task belongs to for this user: a timed task falls on the day its start
 * has in the user's zone, an all-day task on its stored day. Null when undated.
 */
export function taskLocalDay(row: { dueDate: string | null; scheduledStart: string | null }, timezone: string): string | null {
    return taskDay(row, timezone);
}

/**
 * Resolve a coarse `dueWindow` token into an inclusive range of the user's local
 * dates (`YYYY-MM-DD`), from `today` (the user's local date). Pure; callers match
 * tasks against it with {@link taskLocalDay}. `overdue` has no lower bound.
 */
export function resolveDueWindow(
    window: "overdue" | "today" | "this_week" | "this_month",
    today: string,
    weekStartsOn: WeekStart = "Sunday",
): { from?: string; to: string } {
    if (window === "overdue") return { to: addDays(today, -1) };
    if (window === "today") return { from: today, to: today };
    const { start, end } = window === "this_week" ? weekRange(today, weekStartsOn) : monthRange(today);
    return { from: start, to: end };
}
