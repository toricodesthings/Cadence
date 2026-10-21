import { tool } from "ai";
import { z } from "zod";
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { projects, tasks, users } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { Tx } from "../../../types/db";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit } from "./index";
import { taskCoreColumns } from "./tasks";
import { inDayWindow, readTasks } from "../../tasks/tasks.service";
import { expandScheduleScopedTasks, taskDay } from "@cadence/domain/task-recurrence";
import { addDays, formatInZone, toZonedIso, type Zone } from "@cadence/domain/time";
import { busyBlocks, feasibleBuckets, findTimes } from "@cadence/domain/find-time";
import { preferredBuckets } from "@cadence/domain/slot-preference";
import { taskMinutes } from "@cadence/domain/task-length";
import { fitDay, fitMinutes, isFitCandidate } from "@cadence/domain/fit-day";
import type { TimeOfDay } from "@cadence/contracts/planning";
import { toMinimalTask } from "./projections";
import { durationHints } from "../memory/duration";
import { planningEvidence } from "../memory/planning.service";
import { readSnapshotRoutines, routinesDue, type SnapshotRoutineReader } from "./routine-reads";
export { routinesDue } from "./routine-reads";

/** Hard cap on the span a single schedule-window read may cover. */
const MAX_RANGE_DAYS = 62;

/** The task columns a schedule window projects. */
const scheduleColumns = {
    ...taskCoreColumns,
    zone: tasks.zone,
    orderIndex: tasks.orderIndex,
} as const;

/** Rows a window reads before expansion: plenty for ~2 months, a guard against runaway data. */
const WINDOW_ROW_GUARD = 500;

/** What `find_time` offers at most: a short list the person picks from, never every gap. */
const FIND_TIME_PROPOSALS = 3;

/** The calendar's first hour: where Find a time and Fit today start looking (never before 06:00). */
async function timelineStartHour(tx: Tx, userId: string): Promise<number> {
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
    return (row?.settings as { calendar?: { timelineStartHour?: number } } | null)?.calendar?.timelineStartHour ?? 7;
}

export const calendarTools = (env: Env, userId: string, ctx: AgentContext, readRoutines?: SnapshotRoutineReader) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_schedule_window: tool({
        description:
            "Open tasks and the routines due on each day of a local day range (inclusive, up to ~2 months), " +
            "for planning, sorted by day and time. Repeating tasks appear once per occurrence. fixedBlock:true = a class or shift: it " +
            "takes that time, can't be checked off and is never overdue. Tasks page with offset: more:true and nextOffset when there's more.",
        inputSchema: z.object({
            start: z.iso.date().describe("First local day, YYYY-MM-DD."),
            end: z.iso.date().describe("Last local day."),
            includeDone: z.boolean().default(false).describe("Also tasks already done."),
            offset: z.number().int().min(0).max(100_000).optional().describe("From nextOffset; omit for the first page."),
            limit: z.number().int().min(1).max(50).default(50),
        }),
        execute: async ({ start, end, includeDone, offset = 0, limit }) =>
            safeExecute("get_schedule_window", userId, async () => {
                const from = start;
                let to = end;
                // Clamp the span server-side so a huge range can't be requested.
                const maxTo = addDays(from, MAX_RANGE_DAYS);
                if (to > maxTo) to = maxTo;
                const cap = clampLimit(limit, 50);

                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const open = and(
                        eq(tasks.userId, userId),
                        // Trash never, Done only when asked.
                        ne(tasks.state, "ARCHIVED"),
                        includeDone ? undefined : ne(tasks.state, "COMPLETE"),
                    );
                    // Dated one-offs in the window: all-day on `due_on`, timed by the day's instant bounds.
                    const dated = await tx
                        .select(scheduleColumns)
                        .from(tasks)
                        .where(and(open, isNull(tasks.recurrenceRule), inDayWindow(from, to, ctx.timezone)))
                        .limit(WINDOW_ROW_GUARD + 1);
                    // A repeating series is stored at its first date; every one may land in the window.
                    const series = await tx
                        .select(scheduleColumns)
                        .from(tasks)
                        .where(and(open, isNotNull(tasks.recurrenceRule)))
                        .limit(WINDOW_ROW_GUARD);

                    const habitRows = await (readRoutines ? readRoutines(tx) : readSnapshotRoutines(tx, userId));

                    // Same expansion as GET /tasks for a day window: each occurrence of a
                    // repeating series lands on its own day, in the series' zone.
                    const expanded = expandScheduleScopedTasks(series, { from, to }, ctx.timezone);
                    const when = (row: (typeof dated)[number]) => `${taskDay(row, ctx.timezone)} ${row.scheduledStart ?? ""}`;
                    const inRange = [...dated.slice(0, WINDOW_ROW_GUARD), ...expanded].sort((a, b) => when(a).localeCompare(when(b)));
                    const shown = inRange.slice(offset, offset + cap);
                    const idOf = (row: (typeof shown)[number]) => (row as { seriesId?: string }).seriesId ?? row.id;
                    const hints = await durationHints(tx, userId, shown.map((row) => ({ ...row, id: idOf(row) })));
                    const more = inRange.length > offset + cap || dated.length > WINDOW_ROW_GUARD;
                    return {
                        range: { start: from, end: to, timezone: ctx.timezone },
                        tasks: shown.map((row) => toMinimalTask(row, ctx.timezone, hints.get(idOf(row)))),
                        ...(more && { more, nextOffset: offset + cap }),
                        routines: routinesDue(habitRows, from, to, ctx.today, ctx.timezone),
                    };
                });
            }),
    }),

    find_time: tool({
        description:
            "Gaps in the calendar on one local day where a task of its own length fits, best first (at most 3, spaced apart; empty when none fits). " +
            "They are open space in what Cadence can see, with a buffer around other blocks. Read-only: nothing is placed.",
        inputSchema: z.object({
            taskId: z.uuid(),
            day: z.iso.date().describe("The local day to look at, YYYY-MM-DD."),
        }),
        execute: async ({ taskId, day }) =>
            safeExecute("find_time", userId, async () => {
                const zone = ctx.timezone as Zone;
                if (day < ctx.today) return { ok: false as const, error: "That day has passed; look at today or later." };
                return withRls(getDbClient(env), userId, async (tx) => {
                    const [task] = await tx
                        .select({ id: tasks.id, title: tasks.title, state: tasks.state, projectId: tasks.projectId, listName: projects.name, durationEstimate: tasks.durationEstimate, scheduledStart: tasks.scheduledStart, scheduledEnd: tasks.scheduledEnd, notBefore: tasks.notBefore, recurrenceRule: tasks.recurrenceRule, interactionMode: tasks.interactionMode })
                        .from(tasks)
                        .leftJoin(projects, eq(projects.id, tasks.projectId))
                        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
                    if (!task) return { ok: false as const, error: "No such task." };
                    if (task.state === "COMPLETE" || task.state === "ARCHIVED" || task.recurrenceRule || task.interactionMode === "timetable") {
                        return { ok: false as const, error: "Only an open, one-off task has a time to find." };
                    }
                    const hint = (await durationHints(tx, userId, [task])).get(task.id);
                    const minutes = taskMinutes(task, hint?.takesAbout ? { state: "supported", minutes: hint.takesAbout } : null);
                    const busy = busyBlocks(await readTasks(tx, userId, { from: day, to: day }), task.id);
                    const input = {
                        task: { minutes, notBefore: task.notBefore, currentStart: task.scheduledStart },
                        day, zone, now: ctx.currentDate, busy, preferred: [] as TimeOfDay[],
                        timelineStartHour: await timelineStartHour(tx, userId),
                    };
                    // What they like (stated, or learned in Full) only orders the gaps.
                    const preferred = preferredBuckets(await planningEvidence(tx, userId), { title: task.title, projectId: task.projectId, listName: task.listName }, feasibleBuckets(input), ctx.today);
                    const clock = (instant: string) => formatInZone(instant, zone, { hour: "numeric", minute: "2-digit" });
                    return {
                        ok: true as const,
                        task: { id: task.id, title: task.title, minutes },
                        day,
                        proposals: findTimes({ ...input, preferred }).slice(0, FIND_TIME_PROPOSALS).map((p) => ({
                            start: toZonedIso(p.start, zone),
                            end: toZonedIso(p.end, zone),
                            label: `${formatInZone(p.start, zone, { weekday: "short" })} ${clock(p.start)}–${clock(p.end)}`,
                            gap: true as const,
                        })),
                    };
                });
            }),
    }),
    fit_day: tool({
        description:
            "Lays one local day's untimed open tasks into its calendar gaps, in the person's own order, the way Fit today does: " +
            "placed (each with a gap that fits its known length, a buffer around other blocks), didntFit (a known length, no gap left) " +
            "and notSized (no known length). Never touches timed tasks, Fixed blocks or repeating tasks. Read-only: nothing is placed.",
        inputSchema: z.object({
            day: z.iso.date().describe("The local day, YYYY-MM-DD; today unless they named another."),
        }),
        execute: async ({ day }) =>
            safeExecute("fit_day", userId, async () => {
                const zone = ctx.timezone as Zone;
                if (day < ctx.today) return { ok: false as const, error: "That day has passed; look at today or later." };
                return withRls(getDbClient(env), userId, async (tx) => {
                    const onDay = await readTasks(tx, userId, { from: day, to: day });
                    // Today's own set also holds what's still open from earlier days, first, as Today shows it.
                    const carried = day === ctx.today ? (await readTasks(tx, userId, { state: "ACTIVE", effectiveOnOrBeforeDate: day })).filter((t) => (taskDay(t, zone) ?? day) < day) : [];
                    const candidates = [...carried, ...onDay].filter((t, i, all) => isFitCandidate(t) && all.findIndex((o) => o.id === t.id) === i);
                    const hints = await durationHints(tx, userId, candidates);
                    const lists = new Map((await tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId))).map((p) => [p.id, p.name]));
                    const evidence = await planningEvidence(tx, userId);
                    const sized = candidates.map((t) => {
                        const takesAbout = hints.get(t.id)?.takesAbout;
                        return { ...t, minutes: fitMinutes(t, takesAbout ? { state: "supported", minutes: takesAbout } : null), notBefore: t.notBefore ?? null };
                    });
                    const result = fitDay(
                        sized,
                        { day, zone, now: ctx.currentDate, busy: busyBlocks(onDay, ""), timelineStartHour: await timelineStartHour(tx, userId) },
                        (t, feasible) => preferredBuckets(evidence, { title: t.title, projectId: t.projectId, listName: t.projectId ? lists.get(t.projectId) ?? null : null }, feasible, ctx.today),
                    );
                    const byId = new Map(sized.map((t) => [t.id, t]));
                    const clock = (instant: string) => formatInZone(instant, zone, { hour: "numeric", minute: "2-digit" });
                    return {
                        ok: true as const,
                        day,
                        placed: result.placed.map((p) => ({
                            id: p.taskId,
                            title: byId.get(p.taskId)!.title,
                            start: toZonedIso(p.start, zone),
                            end: toZonedIso(p.end, zone),
                            label: `${clock(p.start)}–${clock(p.end)}`,
                        })),
                        didntFit: result.didntFit.map((id) => ({ id, title: byId.get(id)!.title, minutes: byId.get(id)!.minutes })),
                        notSized: result.notSized.map((id) => ({ id, title: byId.get(id)!.title })),
                        gaps: true as const,
                    };
                });
            }),
    }),
});
