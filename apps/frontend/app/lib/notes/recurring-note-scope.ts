/**
 * Recurring-note scope contract for Update 2.
 *
 * All recurring task notes are **series-scoped**. There are no
 * per-occurrence notes. Every note entry point, label, and mutation
 * must resolve to the canonical series owner.
 *
 * Occurrence-specific notes are **explicitly out of scope** and must
 * not be implied anywhere in UI copy, backend API responses, or
 * frontend behavior.
 */

import type { Task } from "@cadence/contracts/task";

/**
 * Returns the canonical note owner task ID for any task.
 * For recurring instances, this resolves to the series ID.
 * For one-off tasks, this is the task's own ID.
 */
export function getNoteOwnerTaskId(task: Task): string {
  if (task.seriesId) return task.seriesId;
  return task.id;
}

/**
 * Returns true if this task's note is series-scoped (i.e., shared
 * across all occurrences of a recurring task).
 */
export function isSeriesScopedNote(task: Task): boolean {
  return Boolean(task.recurrenceRule || task.seriesId || task.isRecurringInstance);
}

/**
 * Returns the scope label that must be shown whenever a user opens
 * or edits a recurring task's note.
 */
export function getNoteScopeLabel(task: Task): string | null {
  if (!isSeriesScopedNote(task)) return null;
  return "Series note";
}

/**
 * Returns contextual copy shown when editing a note from an occurrence.
 */
export function getNoteScopeContext(task: Task): string | null {
  if (!isSeriesScopedNote(task)) return null;
  if (task.isRecurringInstance || task.seriesId) {
    return "Editing the note for this recurring series";
  }
  return null;
}
