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

function inChosen<T>(chosen: readonly T[], value: T): boolean {
    return chosen.length === 0 || chosen.includes(value);
}

function matchesPlacement(task: FocusTask, definition: FocusViewDefinition): boolean {
    const hasDate = Boolean(task.dueDate || task.scheduledStart);
    if (!inChosen(definition.states, task.state) || !inChosen(definition.projectIds, task.projectId ?? ""))
        return false;
    if (definition.needsDate && hasDate) return false;
    if (definition.needsProject && task.projectId) return false;
    if (definition.waitingOnly && task.state !== "WAITING") return false;
    return !(definition.missingStructureOnly && hasDate && task.projectId);
}

function matchesSize(task: FocusTask, definition: FocusViewDefinition): boolean {
    if (definition.priorityMin !== null && task.priority < definition.priorityMin) return false;
    if (definition.effortMax !== null && task.effort !== null && task.effort > definition.effortMax) return false;
    if (definition.effortMin !== null && task.effort !== null && task.effort < definition.effortMin) return false;
    return (
        definition.durationMaxMinutes === null ||
        (task.durationEstimate != null && task.durationEstimate <= definition.durationMaxMinutes)
    );
}

function inDueWindow(
    day: LocalDate | null,
    window: NonNullable<FocusViewDefinition["dueWindow"]>,
    today: LocalDate,
): boolean {
    if (!day) return window !== "overdue";
    switch (window) {
        case "overdue":
            return day < today;
        case "today":
            return day <= today;
        case "this_week":
            return day <= addDaysLocal(today, 7 - weekdayLocal(today));
        case "this_month":
            return day <= endOfMonthLocal(today);
    }
}

export function applyFocusView<T extends FocusTask>(
    tasks: T[],
    definition: FocusViewDefinition,
    ctx: { clock: NlpClock; dayOf: (instant: string) => LocalDate },
): T[] {
    const { dueWindow } = definition;
    return tasks.filter(
        (task) =>
            matchesPlacement(task, definition) &&
            matchesSize(task, definition) &&
            (!dueWindow ||
                inDueWindow(
                    task.dueDate ?? (task.scheduledStart ? ctx.dayOf(task.scheduledStart) : null),
                    dueWindow,
                    ctx.clock.today,
                )),
    );
}
