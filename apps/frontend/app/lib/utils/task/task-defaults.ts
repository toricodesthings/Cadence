import { addDays, weekdayOf, type LocalDate } from "@cadence/domain/time";
import { today } from "../user-zone";
import type { TaskPriority } from "@cadence/contracts/task";

export function mapPriorityNameToNumber(name?: string | null): TaskPriority {
    return name === "low" ? 1 : 0;
}

export function resolveDefaultDueDate(setting?: string | null): LocalDate | undefined {
    const now = today();
    switch (setting) {
        case "Today":
            return now;
        case "Tomorrow":
            return addDays(now, 1);
        case "Next Week":
            return addDays(now, 8 - (weekdayOf(now) || 7));
        default:
            return undefined;
    }
}
