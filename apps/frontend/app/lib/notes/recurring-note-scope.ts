import type { Task } from "@cadence/contracts/task";

export function getNoteOwnerTaskId(task: Task): string {
    if (task.seriesId) return task.seriesId;
    return task.id;
}

export function isSeriesScopedNote(task: Task): boolean {
    return Boolean(task.recurrenceRule || task.seriesId || task.isRecurringInstance);
}

export function getNoteScopeLabel(task: Task): string | null {
    if (!isSeriesScopedNote(task)) return null;
    return "Series note";
}
