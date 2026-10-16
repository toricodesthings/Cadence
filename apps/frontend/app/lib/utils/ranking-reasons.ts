import { rankTasks, type RankableTask, type TaskRankReason } from "@cadence/nlp/ranking";
import type { Task } from "@cadence/contracts/task";
import { dayOfInstant, nlpClock } from "./date-format";

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

/**
 * §11.6: Return a one-sentence rationale ONLY when ranking
 * materially changed the task's order. Returns null for non-material reasons.
 */
export function getMaterialRankingLabel(reasons: TaskRankReason[]): string | null {
    const materialReason = reasons.find((r) => MATERIAL_REASONS.has(r));
    if (!materialReason) return null;
    return REASON_SENTENCES[materialReason];
}

type RankRoute = NonNullable<Parameters<typeof rankTasks>[1]["routeContext"]>;

/** Smart-sorts a route's tasks, returning them in rank order and the one-line reason for each that moved. */
export function rankTasksForRoute(tasks: Task[], routeContext: RankRoute) {
    const rankable: RankableTask[] = tasks.map((t) => ({
        id: t.id,
        priority: t.priority,
        isPinned: t.isPinned,
        orderIndex: t.orderIndex,
        state: t.state,
        dueDate: t.dueDate,
        scheduledStart: t.scheduledStart,
        scheduledEnd: t.scheduledEnd,
        effort: t.effort,
        waitingOn: t.waitingOn ?? null,
        notBefore: t.notBefore ?? null,
        durationEstimate: t.durationEstimate,
    }));
    const ranked = rankTasks(rankable, { routeContext, clock: nlpClock(), dayOf: dayOfInstant });
    const rationaleByTaskId: Record<string, string | null> = {};
    for (const item of ranked) rationaleByTaskId[item.task.id] = getMaterialRankingLabel(item.reasons);
    const idOrder = new Map(ranked.map((r, i) => [r.task.id, i]));
    return { tasks: [...tasks].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0)), rationaleByTaskId };
}
