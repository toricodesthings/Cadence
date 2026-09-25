import { addDays, nextMonday, format } from "date-fns";
import type { TaskPriority } from "@cadence/contracts/task";
import { TASK_PRIORITY_NAMES, type TaskPriorityName } from "@cadence/contracts/constants";

export function mapPriorityNameToNumber(name?: string | null): TaskPriority {
    const level = TASK_PRIORITY_NAMES.indexOf(name as TaskPriorityName);
    return level < 0 ? 0 : (level as TaskPriority);
}

export function resolveDefaultDueDate(setting?: string | null): string | undefined {
    if (!setting || setting === "None") return undefined;
    const today = new Date();
    switch (setting) {
        case "Today":
            return format(today, "yyyy-MM-dd");
        case "Tomorrow":
            return format(addDays(today, 1), "yyyy-MM-dd");
        case "Next Week":
            return format(nextMonday(today), "yyyy-MM-dd");
        default:
            return undefined;
    }
}
