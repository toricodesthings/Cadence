/** SQL for the task day model: all-day tasks match on `due_on`, timed ones on `scheduled_start` bounds in the user's zone. */
import { and, gte, isNotNull, isNull, lt, lte, or, type SQL } from "drizzle-orm";
import { addDays, startOfDay, type LocalDate, type Zone } from "@cadence/domain/time";
import { tasks } from "../../db/schema";

/** Tasks sitting on a day from `from` to `to` (inclusive local days), plus repeating series that began by `to`. */
export function inDayWindow(from: LocalDate, to: LocalDate, zone: Zone): SQL {
    const end = startOfDay(addDays(to, 1), zone);
    return or(
        and(isNull(tasks.scheduledStart), gte(tasks.dueDate, from), lte(tasks.dueDate, to)),
        and(gte(tasks.scheduledStart, startOfDay(from, zone)), lt(tasks.scheduledStart, end)),
        and(isNotNull(tasks.recurrenceRule), or(lte(tasks.dueDate, to), lt(tasks.scheduledStart, end))),
    )!;
}

/** Tasks on `day` or earlier (their day: the due day, or the start's local day). */
export function onOrBefore(day: LocalDate, zone: Zone): SQL {
    return or(
        and(isNull(tasks.scheduledStart), lte(tasks.dueDate, day)),
        lt(tasks.scheduledStart, startOfDay(addDays(day, 1), zone)),
    )!;
}

/** Tasks with no day at all. */
export const hasNoDay = () => and(isNull(tasks.scheduledStart), isNull(tasks.dueDate))!;
