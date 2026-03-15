import { toISODate } from "./date-format";
import type { Task } from "../../types/task";

export function parseYMD(dateStr: string): { y: number; m: number; d: number } {
    const [y, m, d] = dateStr.split("-").map(Number);
    return { y, m: m - 1, d };
}

export function addDaysToIso(iso: string, days: number): string {
    const { y, m, d } = parseYMD(iso);
    const dt = new Date(y, m, d + days);
    return toISODate(dt);
}

export function addMonthsToIso(iso: string, delta: number): string {
    const { y, m, d } = parseYMD(iso);
    let nm = m + delta;
    let ny = y;
    while (nm > 11) { nm -= 12; ny++; }
    while (nm < 0) { nm += 12; ny--; }
    const maxDay = new Date(ny, nm + 1, 0).getDate();
    return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, maxDay)).padStart(2, "0")}`;
}

export function getTaskDurationMs(task: Task) {
    if (task.scheduledStart && task.scheduledEnd) {
        return Math.max(30 * 60_000, new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime());
    }
    return Math.max(30, task.durationEstimate ?? 60) * 60_000;
}
