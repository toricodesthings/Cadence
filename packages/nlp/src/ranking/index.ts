/**
 * Explainable smart task ranking (Section 13).
 *
 * Replaces the old "smart sort" (date + pinned + orderIndex) with
 * a multi-signal ranking model that can explain each decision.
 */

export interface RankableTask {
  id: string;
  priority: number;
  isPinned: boolean;
  orderIndex: number;
  state: string;
  /** ISO date or null */
  dueDate: string | null;
  /** ISO datetime or null */
  scheduledStart: string | null;
  /** ISO datetime or null */
  scheduledEnd: string | null;
  isAllDay: boolean;
  /** 1-3 effort estimate or null */
  effort: number | null;
  /** "waiting on" text or null */
  waitingOn: string | null;
  /** ISO datetime or null — do not show before this */
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

/** Per-route dampening factors — lower values keep tasks closer to manual order */
const ROUTE_DAMPENING: Record<string, number> = {
  today: 1.0,
  upcoming: 0.7,
  project: 0.5,
  inbox: 0.4,
  planner: 0.8,
};

export interface RankingOptions {
  now?: Date;
  /** Current route context hint */
  routeContext?: "today" | "upcoming" | "project" | "inbox" | "planner";
  /** User preference: low-stimulation mode reduces reordering */
  lowStimulation?: boolean;
}

/**
 * Rank tasks with explainable scoring.
 * Returns sorted tasks with reason annotations.
 *
 * §11.6: Applies per-route dampening and low-stimulation stabilization.
 * Low-stim mode halves score deltas, keeping tasks closer to manual order.
 */
export function rankTasks(
  tasks: RankableTask[],
  options: RankingOptions = {},
): RankedTask[] {
  const now = options.now ?? new Date();
  const todayStr = toDateStr(now);
  const routeDampen = ROUTE_DAMPENING[options.routeContext ?? "today"] ?? 1.0;
  const lowStimDampen = options.lowStimulation ? 0.5 : 1.0;
  const dampenFactor = routeDampen * lowStimDampen;

  const ranked = tasks.map((task) => {
    const { score, reasons } = computeScore(task, now, todayStr, options);
    return { task, score: score * dampenFactor, reasons };
  });

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

  const effectiveDate = task.dueDate || task.scheduledStart;
  const effectiveDateStr = effectiveDate
    ? toDateStr(new Date(effectiveDate))
    : null;

  // ── Not-before penalty: suppress tasks that shouldn't be shown yet ──
  if (task.notBefore) {
    const notBeforeTime = new Date(task.notBefore).getTime();
    if (notBeforeTime > now.getTime()) {
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
    const daysUntil = daysDiff(todayStr, effectiveDateStr);
    if (daysUntil > 0 && daysUntil <= 3) {
      score += 15;
      reasons.push("due_soon");
    }
  }

  // ── Scheduled now ──
  if (task.scheduledStart && !task.isAllDay) {
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

  // ── Needs date (in today/planner context, unscheduled tasks bubble up gently) ──
  if (
    !effectiveDate &&
    (options.routeContext === "today" || options.routeContext === "planner")
  ) {
    score += 2;
    reasons.push("needs_date");
  }

  return { score, reasons };
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysDiff(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00Z").getTime();
  const to = new Date(toStr + "T00:00:00Z").getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}
