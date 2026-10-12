/** Per-turn context shared by the chat agent and the MCP server: the user's clock and today's snapshot. */
import { isZone, todayIn, toZonedIso } from "@cadence/domain/time";
import type { buildToolRegistry } from "./tools/index";

type SnapshotTools = Pick<ReturnType<typeof buildToolRegistry>,
    "get_schedule_window" | "get_tasks" | "get_habit_status_today" | "get_inbox_items" | "get_events">;

/**
 * Today at a glance: the reads most turns open with, run before the model starts
 * so "plan my afternoon" needs no read step. Same tools and shapes the model
 * already knows; a failed read is left out. Small caps keep it ~1k tokens.
 */
export async function loadSnapshot(tools: SnapshotTools, today: string): Promise<string> {
    const read = async (t: { execute?: unknown }, input: object): Promise<any> => {
        const result = await (t.execute as (input: object, options: object) => Promise<unknown>)(input, { toolCallId: "snapshot", messages: [] });
        return (result as { ok?: boolean })?.ok === false ? undefined : result;
    };
    const [schedule, overdue, routines, capture, events] = await Promise.all([
        read(tools.get_schedule_window, { start: today, end: today, includeDone: false, limit: 12 }),
        read(tools.get_tasks, { dueWindow: "overdue", limit: 5 }),
        read(tools.get_habit_status_today, {}),
        read(tools.get_inbox_items, { includeProcessed: false, limit: 5 }),
        read(tools.get_events, {}),
    ]);
    const targetTime = new Map<string, string | null>(schedule?.routines.map((r: any) => [r.id, r.targetTime]));
    return JSON.stringify({
        schedule: schedule && { tasks: schedule.tasks, more: schedule.more },
        overdue,
        routines: routines?.statuses.map((s: any) => ({ ...s, targetTime: targetTime.get(s.habitId) ?? undefined })),
        capture,
        events: events?.events.filter((e: { daysUntil: number }) => e.daysUntil <= 7),
    });
}

/**
 * The user's clock for this turn, from `users.time_zone` (synced by ai.route). The model is shown local wall-clock time to the
 * minute with its offset and weekday ("2026-09-21 22:30 -04:00 (Monday)"), never a
 * UTC "Z" instant it would misread as local. Tools get the zone + local date.
 */
export function userClock(timezone: string | undefined, currentDate: string) {
    const tz = isZone(timezone) ? timezone : "UTC";
    const parsed = new Date(currentDate);
    const now = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
    const iso = toZonedIso(now, tz); // 2026-09-21T22:30:00-04:00
    const localTime = `${iso.slice(0, 10)} ${iso.slice(11, 16)} ${iso.slice(19)} (${weekday})`; // time-ok: slicing the zoned ISO string for the prompt, not deriving a day
    return { timezone: tz, now, today: todayIn(tz, now), localTime };
}
