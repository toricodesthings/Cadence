/**
 * Pure focus view filter — no external dependencies (no Fuse.js).
 * Importable separately to avoid pulling Fuse.js into the main bundle.
 */

import type { FocusViewDefinition } from "./index.js";
import { addDaysLocal, endOfMonthLocal, weekdayLocal, type LocalDate, type NlpClock } from "../core/index.js";

type FocusTask = {
  state: string;
  projectId: string | null;
  dueDate: LocalDate | null;
  scheduledStart: string | null;
  priority: number;
  effort: number | null;
  durationEstimate?: number | null | undefined;
  waitingOn?: string | null | undefined;
};

/** Where the task sits: its state, list, and whether it has a date or a list at all. */
function matchesPlacement(task: FocusTask, definition: FocusViewDefinition): boolean {
  const hasDate = Boolean(task.dueDate || task.scheduledStart);
  if (definition.states.length > 0 && !definition.states.includes(task.state)) return false;
  if (definition.projectIds.length > 0 && !definition.projectIds.includes(task.projectId ?? "")) return false;
  if (definition.needsDate && hasDate) return false;
  if (definition.needsProject && task.projectId) return false;
  if (definition.waitingOnly && !task.waitingOn) return false;
  return !(definition.missingStructureOnly && hasDate && task.projectId);
}

/** How big or important the task is. */
function matchesSize(task: FocusTask, definition: FocusViewDefinition): boolean {
  if (definition.priorityMin !== null && task.priority < definition.priorityMin) return false;
  if (definition.effortMax !== null && task.effort !== null && task.effort > definition.effortMax) return false;
  if (definition.effortMin !== null && task.effort !== null && task.effort < definition.effortMin) return false;
  // "Short" is a known estimate: a task with no estimate is not known to be short.
  return definition.durationMaxMinutes === null ||
    (task.durationEstimate != null && task.durationEstimate <= definition.durationMaxMinutes);
}

/** Whether the task's day falls in the window. An undated task is in every window but "overdue". */
function inDueWindow(day: LocalDate | null, window: NonNullable<FocusViewDefinition["dueWindow"]>, today: LocalDate): boolean {
  if (!day) return window !== "overdue";
  switch (window) {
    case "overdue": return day < today;
    case "today": return day <= today;
    // Up to and including the next Sunday (existing behaviour).
    case "this_week": return day <= addDaysLocal(today, 7 - weekdayLocal(today));
    case "this_month": return day <= endOfMonthLocal(today);
  }
}

/**
 * Filter tasks based on a Focus View definition.
 * Works on already-fetched task arrays (client-side filtering).
 */
export function applyFocusView<T extends FocusTask>(
  tasks: T[],
  definition: FocusViewDefinition,
  ctx: { clock: NlpClock; dayOf: (instant: string) => LocalDate },
): T[] {
  const { dueWindow } = definition;
  return tasks.filter((task) =>
    matchesPlacement(task, definition) &&
    matchesSize(task, definition) &&
    (!dueWindow || inDueWindow(task.dueDate ?? (task.scheduledStart ? ctx.dayOf(task.scheduledStart) : null), dueWindow, ctx.clock.today)));
}
