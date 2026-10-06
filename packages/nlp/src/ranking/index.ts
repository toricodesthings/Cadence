/**
 * Explainable smart task ranking (Section 13).
 *
 * Replaces the old "smart sort" (date + pinned + orderIndex) with
 * a multi-signal ranking model that can explain each decision.
 */

import { daysBetweenLocal, type LocalDate, type NlpClock } from "../core/index.js";

export interface RankableTask {
  id: string;
  priority: number;
  isPinned: boolean;
  orderIndex: number;
  state: string;
  /** LocalDate or null */
  dueDate: LocalDate | null;
  /** Instant or null */
  scheduledStart: string | null;
  /** Instant or null */
  scheduledEnd: string | null;
  /** 1-3 effort estimate or null */
  effort: number | null;
  /** "waiting on" text or null */
  waitingOn: string | null;
  /** LocalDate or null — do not show before this day */
  notBefore: string | null;
  /** Duration estimate in minutes or null */
  durationEstimate: number | null;
}

export interface RankedTask {
  task: RankableTask;
  score: number;
  reasons: TaskRankReason[];
}

export type TaskRankReason =
  | "overdue"
  | "due_today"
  | "due_soon"
  | "quick_win"
  | "high_priority"
  | "needs_date"
  | "waiting"
  | "not_yet"
  | "pinned"
  | "scheduled_now";

export interface RankingOptions {
  /** The user's today, from their zone. */
  clock: NlpClock;
  /** Instant to LocalDate in the user's zone (nlp cannot import domain). */
  dayOf: (instant: string) => LocalDate;
  /** Real instant for "scheduled now"; defaults to the current time. */
  now?: Date;
  /** Current route context hint */
  routeContext?: "today" | "upcoming" | "project";
}

/**
 * Rank tasks with explainable scoring.
 * Returns sorted tasks with reason annotations.
 */
export function rankTasks(
  tasks: RankableTask[],
  options: RankingOptions,
): RankedTask[] {
  const now = options.now ?? new Date();
  const todayStr = options.clock.today;

  const ranked = tasks.map((task) => ({ task, ...computeScore(task, now, todayStr, options) }));

  // Sort by score descending, then by order index for stable tie-breaking
  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.task.orderIndex - b.task.orderIndex;
  });

  return ranked;
}

function computeScore(
  task: RankableTask,
  now: Date,
  todayStr: string,
  options: RankingOptions,
): { score: number; reasons: TaskRankReason[] } {
  let score = 0;
  const reasons: TaskRankReason[] = [];

  const effectiveDateStr = task.dueDate ?? (task.scheduledStart ? options.dayOf(task.scheduledStart) : null);
  const effectiveDate = effectiveDateStr;

  // ── Not-before penalty: suppress tasks that shouldn't be shown yet ──
  if (task.notBefore) {
    if (task.notBefore > todayStr) {
      score -= 50;
      reasons.push("not_yet");
    }
  }

  // ── Waiting penalty ──
  if (task.waitingOn) {
    score -= 20;
    reasons.push("waiting");
  }

  // ── Overdue urgency ──
  if (effectiveDateStr && effectiveDateStr < todayStr) {
    score += 40;
    reasons.push("overdue");
  }

  // ── Due today ──
  if (effectiveDateStr === todayStr) {
    score += 30;
    reasons.push("due_today");
  }

  // ── Due soon (within 3 days) ──
  if (effectiveDateStr && !reasons.includes("overdue") && !reasons.includes("due_today")) {
    const daysUntil = daysBetweenLocal(todayStr, effectiveDateStr);
    if (daysUntil > 0 && daysUntil <= 3) {
      score += 15;
      reasons.push("due_soon");
    }
  }

  // ── Scheduled now ──
  if (task.scheduledStart) {
    const startTime = new Date(task.scheduledStart).getTime();
    const diffMs = startTime - now.getTime();
    if (diffMs >= -30 * 60 * 1000 && diffMs <= 60 * 60 * 1000) {
      score += 35;
      reasons.push("scheduled_now");
    }
  }

  // ── Priority ──
  if (task.priority >= 3) {
    score += task.priority * 5;
    reasons.push("high_priority");
  } else if (task.priority > 0) {
    score += task.priority * 2;
  }

  // ── Quick win ──
  if (
    task.effort === 1 ||
    (task.durationEstimate && task.durationEstimate <= 15)
  ) {
    score += 8;
    reasons.push("quick_win");
  }

  // ── Pinned ──
  if (task.isPinned) {
    score += 10;
    reasons.push("pinned");
  }

  // ── Needs date (in today context, unscheduled tasks bubble up gently) ──
  if (!effectiveDate && options.routeContext === "today") {
    score += 2;
    reasons.push("needs_date");
  }

  return { score, reasons };
}
