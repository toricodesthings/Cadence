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

/** The one signal a task's day gives: overdue, due today, or due within three days. */
function dateSignal(day: string | null, today: string): [TaskRankReason, number] | null {
  if (!day) return null;
  if (day < today) return ["overdue", 40];
  if (day === today) return ["due_today", 30];
  return daysBetweenLocal(today, day) <= 3 ? ["due_soon", 15] : null;
}

type AddScore = (points: number, reason?: TaskRankReason) => void;

/** How soon: the day's signal, then starting within the next hour (or started in the last half hour). */
function addTiming(task: RankableTask, day: string | null, now: Date, todayStr: string, add: AddScore) {
  const date = dateSignal(day, todayStr);
  if (date) add(date[1], date[0]);
  const startsIn = task.scheduledStart ? new Date(task.scheduledStart).getTime() - now.getTime() : NaN;
  if (startsIn >= -30 * 60 * 1000 && startsIn <= 60 * 60 * 1000) add(35, "scheduled_now");
}

/** How much it matters and how small it is: priority, a quick win, a pin. */
function addWeight(task: RankableTask, add: AddScore) {
  if (task.priority >= 3) add(task.priority * 5, "high_priority");
  else if (task.priority > 0) add(task.priority * 2);
  if (task.effort === 1 || (task.durationEstimate && task.durationEstimate <= 15)) add(8, "quick_win");
  if (task.isPinned) add(10, "pinned");
}

function computeScore(
  task: RankableTask,
  now: Date,
  todayStr: string,
  options: RankingOptions,
): { score: number; reasons: TaskRankReason[] } {
  let score = 0;
  const reasons: TaskRankReason[] = [];
  const add = (points: number, reason?: TaskRankReason) => {
    score += points;
    if (reason) reasons.push(reason);
  };
  const day = task.dueDate ?? (task.scheduledStart ? options.dayOf(task.scheduledStart) : null);

  // Not yet (hidden until a later day) and waiting sink; urgency, focus and size rise.
  if (task.notBefore && task.notBefore > todayStr) add(-50, "not_yet");
  if (task.waitingOn) add(-20, "waiting");
  addTiming(task, day, now, todayStr, add);
  addWeight(task, add);
  // In Today, unscheduled tasks bubble up gently.
  if (!day && options.routeContext === "today") add(2, "needs_date");

  return { score, reasons };
}
