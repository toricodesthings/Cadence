import { addDays, monthRange, type LocalDate } from "@cadence/domain/time";
import { formatMonthName, formatMonthYear, formatShortDate, getWeekStart } from "../date-format";

const HORIZON_WEEKS = 4;

export interface HorizonGroup<T> {
    key: string;
    label: string;
    items: T[];
}

export function groupFurtherOut<T extends { dueDate: LocalDate }>(
    items: readonly T[],
    today: LocalDate,
): HorizonGroup<T>[] {
    const monthsFrom = addDays(getWeekStart(addDays(today, 8)), HORIZON_WEEKS * 7);
    const groups = new Map<string, HorizonGroup<T> & { from: LocalDate }>();
    for (const item of items) {
        const byWeek = item.dueDate < monthsFrom;
        const start = byWeek ? getWeekStart(item.dueDate) : monthRange(item.dueDate).start;
        const from = byWeek || start >= monthsFrom ? start : monthsFrom;
        const key = `${byWeek ? "week" : "month"}:${start}`;
        let group = groups.get(key);
        if (!group) {
            const month = start.startsWith(today.slice(0, 4)) ? formatMonthName(start) : formatMonthYear(start);
            const label = byWeek ? `Week of ${formatShortDate(start)}` : from === start ? month : `Rest of ${month}`;
            group = { key, label, items: [], from };
            groups.set(key, group);
        }
        group.items.push(item);
    }
    return [...groups.values()].sort((a, b) => a.from.localeCompare(b.from));
}
