/**
 * Pure, token-frugal projection helpers shared by the read tools.
 *
 * These map full DB rows down to the minimal id + status fields the model needs
 * (doc 05 §1.4 "token frugality") — NEVER full `content`/`notes`/markdown bodies.
 * They are pure functions (no DB, no env) so they are unit-tested directly in
 * `tests/unit/ai-tools.test.ts`.
 */

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
    projectId: string | null;
    waitingOn: string | null;
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
    projectId: string | null;
    waitingOn: string | null;
    // content/notes intentionally accepted but DROPPED by the projection.
    content?: string | null;
}

/** Project a task row to its minimal, token-frugal shape. Drops `content`. */
export function toMinimalTask(row: TaskRow): MinimalTask {
    return {
        id: row.id,
        title: row.title,
        state: row.state,
        isAllDay: row.isAllDay,
        dueDate: row.dueDate,
        scheduledStart: row.scheduledStart,
        scheduledEnd: row.scheduledEnd,
        durationEstimate: row.durationEstimate,
        priority: row.priority,
        projectId: row.projectId,
        waitingOn: row.waitingOn,
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
    targetMode: string;
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
    targetMode: string;
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
        targetMode: row.targetMode,
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
 * Resolve a coarse `dueWindow` token into an inclusive ISO-8601 [start,end]
 * range, anchored on the user's local clock. Pure so it is unit-testable; the
 * task tool feeds the result into the reused task-filters `scheduledRangeStart/End`.
 * `overdue` returns only an `end` (everything up to now).
 */
export function resolveDueWindow(
    window: "overdue" | "today" | "this_week" | "this_month",
    currentDate: string,
    weekStartsOn: "Sunday" | "Monday" = "Sunday",
): { start?: string; end: string } {
    const now = new Date(currentDate);
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const startOfDay = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

    if (window === "overdue") {
        // Everything strictly before the start of today is overdue.
        return { end: new Date(startOfDay.getTime() - 1).toISOString() };
    }
    if (window === "today") {
        return { start: startOfDay.toISOString(), end: endOfDay.toISOString() };
    }
    if (window === "this_week") {
        const dow = startOfDay.getUTCDay(); // 0=Sun..6=Sat
        const offset = weekStartsOn === "Monday" ? (dow + 6) % 7 : dow;
        const weekStart = new Date(startOfDay.getTime() - offset * 86_400_000);
        const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000 - 1);
        return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
    }
    // this_month
    const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    return { start: monthStart.toISOString(), end: monthEnd.toISOString() };
}
