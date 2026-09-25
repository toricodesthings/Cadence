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
import { addDaysToDateStr, toLocalDateStr, toZonedIso } from "../../../platform/date-utils";

/**
 * A minimal task row as projected for the model. Keys at their default are left
 * out (no priority, effort, list, waiting, Fixed or repeat → no key), and so is
 * isAllDay: a plain date is all-day, a date with a time is timed.
 */
export interface MinimalTask {
    id: string;
    title: string;
    state: string;
    dueDate?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
    durationEstimate?: number;
    priority?: number;
    effort?: number;
    projectId?: string;
    sectionId?: string;
    waitingOn?: string;
    /** A timetable block (class, shift): occupies time, can't be checked off, never overdue. */
    fixedBlock?: true;
    /** Part of a repeating series; `id` is the series id. */
    repeats?: true;
}

/** The task columns the projection reads (a full row fits; `content` is dropped). */
export type TaskRow = Pick<
    TaskRecord,
    | "id" | "title" | "state" | "isAllDay" | "dueDate" | "scheduledStart" | "scheduledEnd"
    | "durationEstimate" | "priority" | "effort" | "projectId" | "waitingOn" | "interactionMode" | "recurrenceRule"
> & Partial<Pick<TaskRecord, "sectionId" | "content">> & {
    /** Set on an expanded occurrence of a repeating task (see expandScheduleScopedTasks). */
    seriesId?: string;
};

/**
 * Project a task row to its minimal, token-frugal shape. Drops `content`.
 * Dates are written the way the user reads them, so the model never converts:
 * all-day values as the stored calendar date ("2026-03-10"), timed values as the
 * user's wall clock with offset ("2026-03-10T14:00:00-04:00").
 */
export function toMinimalTask(row: TaskRow, timezone: string): MinimalTask {
    const show = (value: string | null) =>
        value === null ? undefined : row.isAllDay ? value.slice(0, 10) : toZonedIso(new Date(value), timezone);
    // Unset fields are undefined, which JSON leaves out, so they cost nothing on the wire.
    return {
        // An expanded occurrence's id is "<series>::<start>"; the model acts on the series.
        id: row.seriesId ?? row.id,
        title: row.title,
        state: row.state,
        dueDate: show(row.dueDate),
        scheduledStart: show(row.scheduledStart),
        scheduledEnd: show(row.scheduledEnd),
        durationEstimate: row.durationEstimate ?? undefined,
        priority: row.priority || undefined,
        effort: row.effort ?? undefined,
        projectId: row.projectId ?? undefined,
        sectionId: row.sectionId ?? undefined,
        waitingOn: row.waitingOn ?? undefined,
        fixedBlock: row.interactionMode === "timetable" || undefined,
        repeats: !!row.recurrenceRule || undefined,
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
    steps?: { id: string; title: string }[];
    currentStreak: number;
    longestStreak: number;
    /** completed / (completed + skipped), 0..1, rounded to 2dp. 0 when no history. */
    adherence: number;
    archived: boolean;
    /** True when the habit is paused on/through `currentDate` (caller-derived). */
    paused: boolean;
}

export type HabitRow = Pick<
    HabitRecord,
    "id" | "title" | "recurrenceRule" | "currentStreak" | "longestStreak" | "totalCompletions" | "totalSkips" | "archived" | "pausedUntil"
> & Partial<Pick<HabitRecord, "emoji" | "targetTime" | "steps">>;

/**
 * Derive a habit's adherence rate from the denormalized completion/skip counts
 * already maintained on the `habits` row (server tracks these iteratively to
 * avoid COUNT(*) — see schema comment). adherence = completions / (completions +
 * skips); 0 when there is no resolved history. `currentDate` (YYYY-MM-DD) is used
 * only to compute the `paused` flag (paused from today through `pausedUntil`).
 */
export function toMinimalHabit(row: HabitRow, currentDate: string): MinimalHabit {
    const resolved = row.totalCompletions + row.totalSkips;
    const adherence = resolved === 0 ? 0 : Math.round((row.totalCompletions / resolved) * 100) / 100;
    const dayKey = currentDate.slice(0, 10);
    const paused = row.pausedUntil !== null && dayKey <= row.pausedUntil;
    return {
        id: row.id,
        title: row.title,
        emoji: row.emoji ?? undefined,
        recurrenceRule: row.recurrenceRule,
        targetTime: row.targetTime || undefined,
        steps: row.steps?.length ? row.steps.map(({ id, title }) => ({ id, title })) : undefined,
        currentStreak: row.currentStreak,
        longestStreak: row.longestStreak,
        adherence,
        archived: row.archived,
        paused,
    };
}

export type InboxItemRow = Pick<InboxItemRecord, "id" | "rawText" | "captureKind" | "captureStatus" | "processed">;

export type MinimalInboxItem = InboxItemRow & { isNote: boolean };

/** Project an inbox capture. `rawText` is the user's own short capture, kept verbatim. */
export function toMinimalInboxItem(row: InboxItemRow): MinimalInboxItem {
    return {
        isNote: row.captureStatus === "kept",
        id: row.id,
        rawText: row.rawText,
        captureKind: row.captureKind,
        captureStatus: row.captureStatus,
        processed: row.processed,
    };
}

/**
 * The calendar day a task belongs to for this user: all-day tasks keep their
 * stored date (a noon-UTC anchor, the same day in every zone); timed tasks fall
 * on the day their start has in the user's zone. Null when undated.
 */
export function taskLocalDay(
    row: { isAllDay: boolean; dueDate: string | null; scheduledStart: string | null },
    timezone: string,
): string | null {
    const value = row.isAllDay ? row.dueDate ?? row.scheduledStart : row.scheduledStart ?? row.dueDate;
    if (!value) return null;
    return row.isAllDay ? value.slice(0, 10) : toLocalDateStr(new Date(value), timezone);
}

/**
 * Resolve a coarse `dueWindow` token into an inclusive range of the user's local
 * dates (`YYYY-MM-DD`), from `today` (the user's local date). Pure; callers match
 * tasks against it with {@link taskLocalDay}. `overdue` has no lower bound.
 */
export function resolveDueWindow(
    window: "overdue" | "today" | "this_week" | "this_month",
    today: string,
    weekStartsOn: "Sunday" | "Monday" = "Sunday",
): { from?: string; to: string } {
    if (window === "overdue") return { to: addDaysToDateStr(today, -1) };
    if (window === "today") return { from: today, to: today };
    if (window === "this_week") {
        const dow = new Date(`${today}T00:00:00.000Z`).getUTCDay(); // 0=Sun..6=Sat
        const from = addDaysToDateStr(today, -(weekStartsOn === "Monday" ? (dow + 6) % 7 : dow));
        return { from, to: addDaysToDateStr(from, 6) };
    }
    const from = `${today.slice(0, 7)}-01`;
    return { from, to: addDaysToDateStr(addDaysToDateStr(from, 32).slice(0, 7) + "-01", -1) };
}
