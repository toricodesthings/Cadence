/**
 * Pure, token-frugal projection helpers shared by the read tools.
 *
 * These map full DB rows down to the minimal id + status fields the model needs
 * (doc 05 §1.4 "token frugality") — NEVER full `content`/`notes`/markdown bodies.
 * They are pure functions (no DB, no env) so they are unit-tested directly in
 * `tests/unit/ai-tools.test.ts`.
 */

import { addDaysToDateStr, toLocalDateStr, toZonedIso } from "../../../platform/date-utils";

/** A minimal task row as projected for the model. */
export interface MinimalTask {
    id: string;
    title: string;
    state: string;
    isAllDay: boolean;
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    durationEstimate: number | null;
    priority: number;
    effort: number | null;
    projectId: string | null;
    waitingOn: string | null;
    /** A timetable block (class, shift): occupies time, can't be checked off, never overdue. */
    fixedBlock: boolean;
    /** Part of a repeating series; `id` is the series id. */
    repeats: boolean;
}

export interface TaskRow {
    id: string;
    title: string;
    state: string;
    isAllDay: boolean;
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    durationEstimate: number | null;
    priority: number;
    effort: number | null;
    projectId: string | null;
    waitingOn: string | null;
    interactionMode: string;
    recurrenceRule: string | null;
    /** Set on an expanded occurrence of a repeating task (see expandScheduleScopedTasks). */
    seriesId?: string;
    // content/notes intentionally accepted but DROPPED by the projection.
    content?: string | null;
}

/**
 * Project a task row to its minimal, token-frugal shape. Drops `content`.
 * Dates are written the way the user reads them, so the model never converts:
 * all-day values as the stored calendar date ("2026-03-10"), timed values as the
 * user's wall clock with offset ("2026-03-10T14:00:00-04:00").
 */
export function toMinimalTask(row: TaskRow, timezone: string): MinimalTask {
    const show = (value: string | null) =>
        value === null ? null : row.isAllDay ? value.slice(0, 10) : toZonedIso(new Date(value), timezone);
    return {
        // An expanded occurrence's id is "<series>::<start>"; the model acts on the series.
        id: row.seriesId ?? row.id,
        title: row.title,
        state: row.state,
        isAllDay: row.isAllDay,
        dueDate: show(row.dueDate),
        scheduledStart: show(row.scheduledStart),
        scheduledEnd: show(row.scheduledEnd),
        durationEstimate: row.durationEstimate,
        priority: row.priority,
        effort: row.effort,
        projectId: row.projectId,
        waitingOn: row.waitingOn,
        fixedBlock: row.interactionMode === "timetable",
        repeats: !!row.recurrenceRule,
    };
}

export interface MinimalSubtask {
    id: string;
    title: string;
    isComplete: boolean;
}

export interface SubtaskRow {
    id: string;
    title: string;
    isComplete: boolean;
}

export function toMinimalSubtask(row: SubtaskRow): MinimalSubtask {
    return { id: row.id, title: row.title, isComplete: row.isComplete };
}

export interface MinimalTag {
    id: string;
    name: string;
    color: string | null;
}

export interface TagRow {
    id: string;
    name: string;
    color: string | null;
}

export function toMinimalTag(row: TagRow): MinimalTag {
    return { id: row.id, name: row.name, color: row.color };
}

export interface MinimalProject {
    id: string;
    name: string;
    emoji: string | null;
    colorAccent: string | null;
}

export interface ProjectRow {
    id: string;
    name: string;
    emoji: string | null;
    colorAccent: string | null;
}

export function toMinimalProject(row: ProjectRow): MinimalProject {
    return { id: row.id, name: row.name, emoji: row.emoji, colorAccent: row.colorAccent };
}

export interface MinimalSection {
    id: string;
    name: string;
    projectId: string | null;
}

export interface SectionRow {
    id: string;
    name: string;
    projectId: string | null;
}

export function toMinimalSection(row: SectionRow): MinimalSection {
    return { id: row.id, name: row.name, projectId: row.projectId };
}

export interface MinimalHabit {
    id: string;
    title: string;
    recurrenceRule: string;
    currentStreak: number;
    longestStreak: number;
    /** completed / (completed + skipped), 0..1, rounded to 2dp. 0 when no history. */
    adherence: number;
    archived: boolean;
    /** True when the habit is paused on/through `currentDate` (caller-derived). */
    paused: boolean;
}

export interface HabitRow {
    id: string;
    title: string;
    recurrenceRule: string;
    currentStreak: number;
    longestStreak: number;
    totalCompletions: number;
    totalSkips: number;
    archived: boolean;
    pausedUntil: string | null;
}

/**
 * Derive a habit's adherence rate from the denormalized completion/skip counts
 * already maintained on the `habits` row (server tracks these iteratively to
 * avoid COUNT(*) — see schema comment). adherence = completions / (completions +
 * skips); 0 when there is no resolved history. `currentDate` (YYYY-MM-DD) is used
 * only to compute the `paused` flag, mirroring habits.route.ts `isHabitPaused`.
 */
export function toMinimalHabit(row: HabitRow, currentDate: string): MinimalHabit {
    const resolved = row.totalCompletions + row.totalSkips;
    const adherence = resolved === 0 ? 0 : Math.round((row.totalCompletions / resolved) * 100) / 100;
    const dayKey = currentDate.slice(0, 10);
    const paused = row.pausedUntil !== null && dayKey <= row.pausedUntil;
    return {
        id: row.id,
        title: row.title,
        recurrenceRule: row.recurrenceRule,
        currentStreak: row.currentStreak,
        longestStreak: row.longestStreak,
        adherence,
        archived: row.archived,
        paused,
    };
}

export interface MinimalInboxItem {
    id: string;
    rawText: string;
    captureKind: string;
    captureStatus: string;
    processed: boolean;
}

export interface InboxItemRow {
    id: string;
    rawText: string;
    captureKind: string;
    captureStatus: string;
    processed: boolean;
}

/** Project an inbox capture. `rawText` is the user's own short capture, kept verbatim. */
export function toMinimalInboxItem(row: InboxItemRow): MinimalInboxItem {
    return {
        id: row.id,
        rawText: row.rawText,
        captureKind: row.captureKind,
        captureStatus: row.captureStatus,
        processed: row.processed,
    };
}

export interface MinimalSuggestion {
    id: string;
    type: string;
    title: string;
    status: string;
    relatedTaskIds: string[];
}

export interface SuggestionRow {
    id: string;
    type: string;
    title: string;
    status: string;
    relatedTaskIds: string[] | null;
    // body intentionally accepted but DROPPED.
    body?: string | null;
}

/** Project a suggestion. Drops the free-text `body` to stay token-frugal. */
export function toMinimalSuggestion(row: SuggestionRow): MinimalSuggestion {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        status: row.status,
        relatedTaskIds: row.relatedTaskIds ?? [],
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
