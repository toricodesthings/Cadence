import { addDays, weekdayOf, type LocalDate } from "@cadence/domain/time";
import { today } from "../user-zone";
import type { TaskPriority } from "@cadence/contracts/task";

/** A default above Low would give every task an importance the person never stated, so only "low" counts. */
export function mapPriorityNameToNumber(name?: string | null): TaskPriority {
    return name === "low" ? 1 : 0;
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
