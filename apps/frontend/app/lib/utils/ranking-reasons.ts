import type { TaskRankReason } from "@cadence/nlp/ranking";

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

export function getRankingReasonLabel(reasons: TaskRankReason[]): string | null {
    if (reasons.length === 0) return null;
    return REASON_LABELS[reasons[0]];
}
