import { addDays, weekdayOf, type LocalDate } from "@cadence/domain/time";
import { today } from "../user-zone";
import type { TaskPriority } from "@cadence/contracts/task";
import { TASK_PRIORITY_NAMES, type TaskPriorityName } from "@cadence/contracts/constants";

export function mapPriorityNameToNumber(name?: string | null): TaskPriority {
    const level = TASK_PRIORITY_NAMES.indexOf(name as TaskPriorityName);
    return level < 0 ? 0 : (level as TaskPriority);
}

/** The default due day a new task gets (a LocalDate), from Settings. */
export function resolveDefaultDueDate(setting?: string | null): LocalDate | undefined {
    const now = today();
    switch (setting) {
        case "Today":
            return now;
        case "Tomorrow":
            return addDays(now, 1);
        case "Next Week":
            // The coming Monday (a Monday today means next week's).
            return addDays(now, 8 - (weekdayOf(now) || 7));
        default:
            return undefined;
    }
}
