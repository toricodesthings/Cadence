import { addDays, formatInZone, isZone, todayIn, toZonedIso, type Zone } from "@cadence/domain/time";
import { weekRoom } from "@cadence/domain/fit-day";
import { withLoadShares } from "../../platform/load-share";
import { taskDay } from "@cadence/domain/task-recurrence";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { readTasks } from "../tasks/tasks.service";
import { calendarTools, dayHours, routinesDue } from "./tools/calendar";
import { habitTools } from "./tools/habits";
import { readSnapshotRoutines, type SnapshotRoutineReader } from "./tools/routine-reads";
import type { Env } from "../../types/env";
import type { AgentContext, buildToolRegistry } from "./tools/index";
import type { projectEvents } from "./tools/events";

type SnapshotTools = Pick<
    ReturnType<typeof buildToolRegistry>,
    "get_schedule_window" | "get_tasks" | "get_habit_status_today" | "get_inbox_items" | "get_events"
>;

export async function loadSnapshot(
    tools: SnapshotTools,
    today: string,
    eventsSnapshot?: ReturnType<typeof projectEvents>,
    limit = 5,
): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    const read = async (t: { execute?: unknown }, input: object): Promise<any> => {
        const result = await (t.execute as (input: object, options: object) => Promise<unknown>)(input, {
            toolCallId: "snapshot",
            messages: [],
        });
        return (result as { ok?: boolean })?.ok === false ? undefined : result;
    };
    const [schedule, overdue, routines, capture, events] = await Promise.all([
        read(tools.get_schedule_window, { start: today, end: today, includeDone: false, limit: 12 }),
        read(tools.get_tasks, { dueWindow: "overdue", limit }),
        read(tools.get_habit_status_today, {}),
        read(tools.get_inbox_items, { includeProcessed: false, limit }),
        eventsSnapshot ?? read(tools.get_events, {}),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    const targetTime = new Map<string, string | null>(schedule?.routines.map((r: any) => [r.id, r.targetTime]));
    return JSON.stringify({
        schedule: schedule && { tasks: schedule.tasks, more: schedule.more },
        overdue,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
        routines: routines?.statuses.map((s: any) => ({ ...s, targetTime: targetTime.get(s.habitId) ?? undefined })),
        capture,
        events: events?.events.filter((e: { daysUntil: number }) => e.daysUntil <= 7),
    });
}

const WEEK_DEADLINES = 5;
const WEEK_TITLE_CHARS = 60;

export async function loadWeekAhead(
    env: Env,
    userId: string,
    ctx: Pick<AgentContext, "timezone" | "today" | "currentDate">,
): Promise<string> {
    const zone = ctx.timezone as Zone;
    const last = addDays(ctx.today, 6);
    return withRls(getDbClient(env), userId, async (tx) => {
        const [tasks, routines, hours] = await Promise.all([
            readTasks(tx, userId, { from: ctx.today, to: last }, { shared: true }),
            readSnapshotRoutines(tx, userId, zone),
            dayHours(tx, userId),
        ]);
        const due = routinesDue(routines, ctx.today, last, ctx.today, zone);
        const room = weekRoom(await withLoadShares(tx, userId, tasks), {
            from: ctx.today,
            days: 7,
            zone,
            ...hours,
            now: ctx.currentDate,
        });
        return JSON.stringify(
            room.map((d) => ({
                day: `${d.day} ${formatInZone(d.day, "UTC", { weekday: "short" }, "en-US")}`,
                bookedMinutes: d.bookedMinutes,
                openMinutes: d.openMinutes,
                deadlines: d.deadlines
                    .slice(0, WEEK_DEADLINES)
                    .map((t) => ({ id: t.id, title: t.title.slice(0, WEEK_TITLE_CHARS) })),
                ...(d.deadlines.length > WEEK_DEADLINES && { more: true }),
                fixedBlocks: tasks.filter((t) => t.interactionMode === "timetable" && taskDay(t, zone) === d.day)
                    .length,
                routinesDue: due.filter((r) => r.days.includes(d.day)).length,
            })),
        );
    });
}

export function loadAgentSnapshot(
    env: Env,
    userId: string,
    ctx: AgentContext,
    tools: SnapshotTools,
    events?: ReturnType<typeof projectEvents>,
) {
    let pending: ReturnType<SnapshotRoutineReader> | undefined;
    const readRoutines: SnapshotRoutineReader = (tx) =>
        (pending ??= Promise.resolve(readSnapshotRoutines(tx, userId, ctx.timezone as Zone)).catch((error) => {
            pending = undefined;
            throw error;
        }));
    return loadSnapshot(
        {
            ...tools,
            get_schedule_window: calendarTools(env, userId, ctx, readRoutines).get_schedule_window,
            get_habit_status_today: habitTools(env, userId, ctx, readRoutines).get_habit_status_today,
        },
        ctx.today,
        events,
    );
}

export function userClock(timezone: string | undefined, currentDate: string) {
    const tz = isZone(timezone) ? timezone : "UTC";
    const parsed = new Date(currentDate);
    const now = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const weekday = formatInZone(now, tz, { weekday: "long" });
    const iso = toZonedIso(now, tz);
    const localTime = `${iso.slice(0, 10)} ${iso.slice(11, 16)} ${iso.slice(19)} (${weekday})`; // time-ok: slicing the zoned ISO string for the prompt, not deriving a day
    return { timezone: tz, now, today: todayIn(tz, now), localTime };
}
