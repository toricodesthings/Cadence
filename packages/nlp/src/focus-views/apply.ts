/**
 * Pure focus view filter — no external dependencies (no Fuse.js).
 * Importable separately to avoid pulling Fuse.js into the main bundle.
 */

import type { FocusViewDefinition } from "./index.js";
import { addDaysLocal, endOfMonthLocal, weekdayLocal, type LocalDate, type NlpClock } from "../core/index.js";

/**
 * Filter tasks based on a Focus View definition.
 * Works on already-fetched task arrays (client-side filtering).
 */
export function applyFocusView<
  T extends {
    state: string;
    projectId: string | null;
    dueDate: LocalDate | null;
    scheduledStart: string | null;
    priority: number;
    effort: number | null;
    waitingOn?: string | null | undefined;
  },
>(
  tasks: T[],
  definition: FocusViewDefinition,
  ctx: { clock: NlpClock; dayOf: (instant: string) => LocalDate },
): T[] {
  const todayStr = ctx.clock.today;

  return tasks.filter((task) => {
    if (definition.states.length > 0 && !definition.states.includes(task.state)) {
      return false;
    }
    if (definition.projectIds.length > 0 && !definition.projectIds.includes(task.projectId ?? "")) {
      return false;
    }
    if (definition.needsDate && (task.dueDate || task.scheduledStart)) {
      return false;
    }
    if (definition.needsProject && task.projectId) {
      return false;
    }
    if (definition.priorityMin !== null && task.priority < definition.priorityMin) {
      return false;
    }
    if (definition.effortMax !== null && task.effort !== null && task.effort > definition.effortMax) {
      return false;
    }
    if (definition.waitingOnly && !task.waitingOn) {
      return false;
    }
    if (definition.dueWindow) {
      const effectiveDateStr = task.dueDate ?? (task.scheduledStart ? ctx.dayOf(task.scheduledStart) : null);
      if (!effectiveDateStr) return definition.dueWindow === "overdue" ? false : true;
      switch (definition.dueWindow) {
        case "overdue":
          if (effectiveDateStr >= todayStr) return false;
          break;
        case "today":
          if (effectiveDateStr > todayStr) return false;
          break;
        case "this_week": {
          // Up to and including the next Sunday (existing behaviour).
          if (effectiveDateStr > addDaysLocal(todayStr, 7 - weekdayLocal(todayStr))) return false;
          break;
        }
        case "this_month": {
          if (effectiveDateStr > endOfMonthLocal(todayStr)) return false;
          break;
        }
      }
    }
    if (definition.missingStructureOnly) {
      const hasDate = task.dueDate || task.scheduledStart;
      const hasProject = task.projectId;
      if (hasDate && hasProject) return false;
    }
    return true;
  });
}
