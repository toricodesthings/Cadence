import type { TaskRankReason } from "@cadence/nlp/ranking";

/** §11.6: Short jargon labels for compact UI (e.g., badges) */
const REASON_LABELS: Record<TaskRankReason, string> = {
    overdue: "Overdue",
    due_today: "Due today",
    due_soon: "Due soon",
    quick_win: "Quick win",
    high_priority: "High priority",
    needs_date: "Needs a date",
    waiting: "Waiting",
    not_yet: "Not before",
    pinned: "Pinned",
    scheduled_now: "Scheduled now",
};

/** §11.6: One-sentence reasoning for Today and Upcoming rationale display */
const REASON_SENTENCES: Record<TaskRankReason, string> = {
    overdue: "This task is past its due date",
    due_today: "This task is due today",
    due_soon: "This task is due within the next few days",
    quick_win: "This is a quick task you can finish fast",
    high_priority: "This task has a high priority level",
    needs_date: "This task needs a date to be scheduled",
    waiting: "This task is waiting on someone else",
    not_yet: "This task is deferred until a later date",
    pinned: "You pinned this task to keep it visible",
    scheduled_now: "This task is scheduled around the current time",
};

/** §9.2: Reasons that indicate ranking materially changed order */
const MATERIAL_REASONS: Set<TaskRankReason> = new Set([
    "overdue",
    "quick_win",
    "high_priority",
    "pinned",
    "scheduled_now",
    "waiting",
]);

export function getRankingReasonLabel(reasons: TaskRankReason[]): string | null {
    if (reasons.length === 0) return null;
    return REASON_LABELS[reasons[0]];
}

/**
 * §11.6: Return a one-sentence rationale ONLY when ranking
 * materially changed the task's order. Returns null for non-material reasons.
 */
export function getMaterialRankingLabel(reasons: TaskRankReason[]): string | null {
    const materialReason = reasons.find((r) => MATERIAL_REASONS.has(r));
    if (!materialReason) return null;
    return REASON_SENTENCES[materialReason];
}
