import { addDays, nextMonday, format } from "date-fns";
import type { TaskPriority } from "@cadence/contracts/task";

const PRIORITY_MAP: Record<string, TaskPriority> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
};

export function mapPriorityNameToNumber(name?: string | null): TaskPriority {
    if (!name) return 0;
    return PRIORITY_MAP[name] ?? 0;
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
