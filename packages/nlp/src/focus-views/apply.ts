/**
 * Pure focus view filter — no external dependencies (no Fuse.js).
 * Importable separately to avoid pulling Fuse.js into the main bundle.
 */

import type { FocusViewDefinition } from "./index.js";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Filter tasks based on a Focus View definition.
 * Works on already-fetched task arrays (client-side filtering).
 */
export function applyFocusView<
  T extends {
    state: string;
    projectId: string | null;
    dueDate: string | null;
    scheduledStart: string | null;
    priority: number;
    effort: number | null;
    waitingOn?: string | null | undefined;
  },
>(tasks: T[], definition: FocusViewDefinition, now?: Date): T[] {
  const currentDate = now ?? new Date();
  const todayStr = toDateStr(currentDate);

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
      const effectiveDate = task.dueDate || task.scheduledStart;
      if (!effectiveDate) return definition.dueWindow === "overdue" ? false : true;
      const effectiveDateStr = toDateStr(new Date(effectiveDate));
      switch (definition.dueWindow) {
        case "overdue":
          if (effectiveDateStr >= todayStr) return false;
          break;
        case "today":
          if (effectiveDateStr > todayStr) return false;
          break;
        case "this_week": {
          const weekEnd = new Date(currentDate);
          weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
          if (effectiveDateStr > toDateStr(weekEnd)) return false;
          break;
        }
        case "this_month": {
          const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
          if (effectiveDateStr > toDateStr(monthEnd)) return false;
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
