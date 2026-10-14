import type { Task } from "@cadence/contracts/task";
import type { LocalDate } from "@cadence/domain/time";
import { taskDays } from "./schedule-day";

const MAX_ROWS = 2;
interface Bar {
    task: Task;
    from: number;
    to: number;
    row: number;
    clippedStart: boolean;
    clippedEnd: boolean;
}

/** Pack bars first, then fill each day's free cells. Overflow is local to that day. */
export function buildAllDayWeekLayout(weekDates: LocalDate[], tasksByDate: Record<string, Task[]>) {
    const column = new Map(weekDates.map((day, index) => [day, index]));
    const seen = new Set<string>();
    const spans: Bar[] = [];
    const singles: Task[][] = weekDates.map(() => []);
    const anytime: Task[][] = weekDates.map(() => []);
    weekDates.forEach((day, index) => {
        for (const task of tasksByDate[day] ?? []) {
            if (task.scheduledStart) continue;
            if (task.isHabit) {
                anytime[index].push(task);
                continue;
            }
            const days = taskDays(task);
            if (days.length <= 1) {
                singles[index].push(task);
                continue;
            }
            if (seen.has(task.id)) continue;
            seen.add(task.id);
            const inWeek = days.flatMap((d) => (column.has(d) ? [column.get(d)!] : []));
            if (!inWeek.length) continue;
            spans.push({
                task,
                from: Math.min(...inWeek),
                to: Math.max(...inWeek),
                row: 0,
                clippedStart: days[0] < weekDates[0],
                clippedEnd: days.at(-1)! > weekDates.at(-1)!,
            });
        }
    });
    spans.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));
    const occupied: boolean[][] = [];
    for (const bar of spans) {
        let row = occupied.findIndex((cells) => cells.slice(bar.from, bar.to + 1).every((taken) => !taken));
        if (row === -1) {
            row = occupied.length;
            occupied.push(weekDates.map(() => false));
        }
        for (let col = bar.from; col <= bar.to; col++) occupied[row][col] = true;
        bar.row = row;
    }
    const shownBars = spans.filter((bar) => bar.row < MAX_ROWS);
    const days = weekDates.map((_, index) => {
        const priority = [...singles[index]].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        const free = Array.from({ length: MAX_ROWS }, (_, row) => row).filter((row) => !occupied[row]?.[index]);
        const shown = priority.slice(0, free.length).map((task, i) => ({ task, row: free[i] }));
        const bars = spans.filter((bar) => bar.from <= index && bar.to >= index);
        return {
            shown,
            overflow: [
                ...priority.slice(free.length),
                ...bars.filter((bar) => bar.row >= MAX_ROWS).map((bar) => bar.task),
            ],
            secondRow: [
                ...shown.filter((entry) => entry.row === 1).map((entry) => entry.task),
                ...bars.filter((bar) => bar.row === 1).map((bar) => bar.task),
            ],
        };
    });
    const rows = Math.max(
        0,
        ...shownBars.map((bar) => bar.row + 1),
        ...days.flatMap((day) => day.shown.map((entry) => entry.row + 1)),
    );
    return { shownBars, days, rows, anytime };
}
