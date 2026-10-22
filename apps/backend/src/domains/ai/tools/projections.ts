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
import { addDays, monthRange, toZonedIso, weekRange, type WeekStart } from "@cadence/domain/time";
import { NOTE_READ_LIMIT } from "./drafts";
import { TAG_COLOR_NAMES, TAG_PALETTE } from "@cadence/contracts/constants";

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
    /** Its tags, by name. */
    tags?: string[];
    pinned?: true;
    /** When Cadence reminds the user, local time with offset. */
    reminderAt?: string;
    /** A Waiting task's check-in, local time with offset. */
    checkInAt?: string;
    /** Hidden from lists until this local day. */
    hiddenUntil?: string;
    /** What it usually takes them, in minutes, when Cadence is sure from their own answers (an open task with no length of its own). */
    takesAbout?: number;
    /** What a finished task took, as they said it: minutes, or a range like "30–60". */
    took?: number | string;
}

/** The task columns the projection reads (a full row fits; `content` is dropped). */
export type TaskRow = Pick<
    TaskRecord,
    | "id" | "title" | "state" | "dueDate" | "scheduledStart" | "scheduledEnd"
    | "durationEstimate" | "priority" | "effort" | "projectId" | "waitingOn" | "interactionMode" | "recurrenceRule"
> & Partial<Pick<TaskRecord, "endDate" | "sectionId" | "content" | "isPinned" | "reminderAt" | "waitingReminder" | "notBefore">> & {
    /** Set on an expanded occurrence of a repeating task (see expandScheduleScopedTasks). */
    seriesId?: string;
    tagNames?: string[];
    listName?: string | null;
    sectionName?: string | null;
};

/** Unset (null) → undefined, which JSON leaves out. */
const unset = <T>(value: T | null | undefined): T | undefined => value ?? undefined;
/** A list only when it has items. */
const nonEmpty = <T>(list: T[] | null | undefined): T[] | undefined => (list?.length ? list : undefined);

/**
 * Project a task row to its minimal, token-frugal shape. Drops `content`.
 * Dates are written the way the user reads them, so the model never converts:
 * days as stored ("2026-03-10"), instants as the user's wall clock with offset
 * ("2026-03-10T14:00:00-04:00").
 */
export function toMinimalTask(row: TaskRow, timezone: string, hint?: { takesAbout?: number; took?: number | string }): MinimalTask {
    const show = (value: string | null | undefined) => (value ? toZonedIso(value, timezone) : undefined);
    const fixedBlock = row.interactionMode === "timetable";
    // Unset fields are undefined, which JSON leaves out, so they cost nothing on the wire.
    return {
        // An expanded occurrence's id is "<series>::<start>"; the model acts on the series.
        id: row.seriesId ?? row.id,
        title: row.title,
        state: fixedBlock && row.state === "ACTIVE" ? undefined : row.state,
        dueDate: unset(row.dueDate),
        endDate: unset(row.endDate),
        scheduledStart: show(row.scheduledStart),
        scheduledEnd: show(row.scheduledEnd),
        durationEstimate: unset(row.durationEstimate),
        priority: row.priority || undefined,
        effort: unset(row.effort),
        projectId: unset(row.projectId),
        sectionId: unset(row.sectionId),
        list: unset(row.listName),
        section: unset(row.sectionName),
        waitingOn: unset(row.waitingOn),
        fixedBlock: fixedBlock || undefined,
        repeats: !!row.recurrenceRule || undefined,
        tags: nonEmpty(row.tagNames),
        pinned: row.isPinned || undefined,
        reminderAt: show(row.reminderAt),
        checkInAt: show(row.waitingReminder),
        hiddenUntil: unset(row.notBefore),
        takesAbout: hint?.takesAbout,
        took: hint?.took,
    };
}

export type MinimalSubtask = Pick<SubtaskRecord, "id" | "title" | "isComplete">;

export function toMinimalSubtask(row: MinimalSubtask): MinimalSubtask {
    return { id: row.id, title: row.title, isComplete: row.isComplete };
}

export type MinimalTag = Pick<TagRecord, "id" | "name" | "color">;

/** A tag as the model reads it: a palette colour by name (as it sends one), any other value as stored. */
export function toMinimalTag(row: MinimalTag): MinimalTag {
    const palette = TAG_PALETTE.indexOf(row.color as (typeof TAG_PALETTE)[number]);
    return { id: row.id, name: row.name, color: palette >= 0 ? TAG_COLOR_NAMES[palette]! : row.color };
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
    /** Set times each day, HH:MM (each checked off on its own); replaces targetTime and dayTimes. */
    times?: string[];
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
> & Partial<Pick<HabitRecord, "emoji" | "targetTime" | "steps" | "targetTimes" | "times" | "colorAccent" | "projectId">> & { tagIds?: string[] };

/**
 * Project a routine. `recent` is its last 30 days before today (from `habitDays`):
 * adherence = done / (done + missed), skipped days neutral, so a day nobody
 * logged counts against it (the stored totals never see those). `currentDate`
 * (YYYY-MM-DD) sets the `paused` flag (paused from today through `pausedUntil`).
 */
export function toMinimalHabit(row: HabitRow, currentDate: string, recent?: { done: number; missed: number }): MinimalHabit {
    const counted = recent ? recent.done + recent.missed : 0;
    const paused = isPausedOn(row.pausedUntil, currentDate, currentDate);
    const times = nonEmpty(row.times);
    return {
        id: row.id,
        title: row.title,
        emoji: unset(row.emoji),
        recurrenceRule: row.recurrenceRule,
        targetTime: times ? undefined : row.targetTime || undefined,
        dayTimes: !times && row.targetTimes && Object.keys(row.targetTimes).length ? row.targetTimes : undefined,
        times,
        // "lantern" is the default colour, left out like other defaults.
        colorAccent: row.colorAccent && row.colorAccent !== "lantern" ? row.colorAccent : undefined,
        projectId: unset(row.projectId),
        tagIds: nonEmpty(row.tagIds),
        steps: nonEmpty(row.steps)?.map(({ id, title }) => ({ id, title })),
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
 * Resolve a coarse `dueWindow` token into an inclusive range of the user's local
 * dates (`YYYY-MM-DD`), from `today` (the user's local date). Pure; callers match
 * tasks against it with `taskDay`. `overdue` has no lower bound.
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
