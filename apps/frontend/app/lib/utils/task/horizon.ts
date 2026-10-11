import { addDays, monthRange, type LocalDate } from "@cadence/domain/time";
import { formatMonthName, formatMonthYear, formatShortDate, getWeekStart } from "../date-format";

/** Calendar weeks shown one by one after Upcoming's 7 days, before the rest groups by month. */
const HORIZON_WEEKS = 4;

export interface HorizonGroup<T> {
    key: string;
    label: string;
    items: T[];
}

/**
 * Upcoming's "Further out", grouped the way people plan far ahead: the next four calendar weeks one by one, then whole
 * months. Groups run in date order; each keeps its items in the order given, so the route's sort still applies.
 */
export function groupFurtherOut<T extends { dueDate: LocalDate }>(items: readonly T[], today: LocalDate): HorizonGroup<T>[] {
    const monthsFrom = addDays(getWeekStart(addDays(today, 8)), HORIZON_WEEKS * 7);
    const groups = new Map<string, HorizonGroup<T> & { first: LocalDate }>();
    for (const item of items) {
        const day = item.dueDate;
        const byWeek = day < monthsFrom;
        const start = byWeek ? getWeekStart(day) : monthRange(day).start;
        const key = `${byWeek ? "week" : "month"}:${start}`;
        let group = groups.get(key);
        if (!group) {
            const label = byWeek ? `Week of ${formatShortDate(start)}`
                : start.startsWith(today.slice(0, 4)) ? formatMonthName(start) : formatMonthYear(start);
            group = { key, label, items: [], first: day };
            groups.set(key, group);
        }
        group.items.push(item);
        if (day < group.first) group.first = day;
    }
    return [...groups.values()]
        .sort((a, b) => a.first.localeCompare(b.first))
        .map(({ key, label, items: grouped }) => ({ key, label, items: grouped }));
}
