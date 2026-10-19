/**
 * "How long did it take?": the server's half. It decides whether a question may be asked
 * (`@cadence/domain/duration-ask`), reserves the day when it does, and keeps one confirmed report per completion
 * (`duration_reports`, keyed by the task and the instant it entered Done). Reports are the person's own words, so
 * they live outside the signals' 90-day prune.
 */
import { and, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { DurationEvidenceRow, DurationReport, DurationReportView, RoutineDuration, RoutineDurationKey, RoutineDurationView } from "@cadence/contracts/memory";
import { shouldAsk, referenceMinutes, type DurationAskState, type GroupHistory } from "@cadence/domain/duration-ask";
import { addDays, daysBetween, todayIn, type LocalDate } from "@cadence/domain/time";
import { estimateDuration } from "@cadence/nlp/duration";
import { durationReports, habitLogs, habits, tasks, users } from "../../../db/schema";
import { AppError } from "../../../platform/errors";
import { userZone } from "../../../platform/user-zone";
import type { Tx } from "../../../types/db";
import { groupOfTask, type ReportRow } from "./signals";
import { readMemoryState } from "./memory-mode";

const askStateOf = (settings: unknown): DurationAskState | null => {
    const raw = (settings as { assistant?: { durationAsk?: Partial<DurationAskState> | null } } | null)?.assistant?.durationAsk;
    return raw ? { lastOn: raw.lastOn ?? null, misses: raw.misses ?? 0, token: raw.token, shownToken: raw.shownToken } : null;
};

/** Reports kept after Forget hides them are not read: a forgotten group is as good as gone until Undo. */
const visible = (userId: string) => and(eq(durationReports.userId, userId), isNull(durationReports.forgottenAt));

/** The midpoint a range stands for when asking whether a group is settled. */
const centre = (low: number, high: number) => (low === high ? low : Math.round(Math.sqrt(low * high)));

/** What the group already holds: its answers' minutes and how old the newest is. */
async function historyOf(tx: Tx, userId: string, group: string, today: LocalDate): Promise<GroupHistory> {
    const rows = await tx
        .select({ low: durationReports.lowMinutes, high: durationReports.highMinutes, saidOn: durationReports.saidOn })
        .from(durationReports)
        .where(and(visible(userId), eq(durationReports.groupKey, group)));
    const newest = rows.map((r) => r.saidOn).sort().at(-1);
    return { minutes: rows.map((r) => centre(r.low, r.high)), newestDaysAgo: newest ? daysBetween(newest, today) : null };
}

const writeAsk = (tx: Tx, userId: string, settings: Record<string, any>, value: DurationAskState) =>
    tx.update(users).set({ settings: { ...settings, assistant: { ...(settings.assistant ?? {}), durationAsk: value } } }).where(eq(users.id, userId));

/** The user row, locked: two devices can't interleave their budget edits. */
async function lockedSettings(tx: Tx, userId: string): Promise<Record<string, any>> {
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1).for("update");
    return (row?.settings ?? {}) as Record<string, any>;
}

/**
 * Should the question be asked for this just-completed task? Never says why: asking must not reveal the mode.
 * An ask spends the day right here (D4), under the user-row lock, so a second device gets `ask: false`.
 */
export async function askDuration(tx: Tx, userId: string, taskId: string, now = new Date()): Promise<{ token: string; completedAt: string; reference: number | null } | null> {
    const settings = await lockedSettings(tx, userId);
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    if (!task || task.state !== "COMPLETE" || !task.completedAt) return null;
    if ((await readMemoryState(tx, userId)).mode !== "full") return null;

    const today = todayIn(await userZone(tx, userId), now);
    const history = await historyOf(tx, userId, groupOfTask(task), today);
    const state = askStateOf(settings);
    const ageMs = new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
    if (!shouldAsk({ state, today, ageMs, history })) return null;

    const token = crypto.randomUUID();
    await writeAsk(tx, userId, settings, { lastOn: today, misses: state?.misses ?? 0, token, shownToken: state?.shownToken });
    const blockMinutes = task.scheduledStart && task.scheduledEnd
        ? Math.round((new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime()) / 60_000)
        : null;
    return { token, completedAt: task.completedAt, reference: referenceMinutes({ durationEstimate: task.durationEstimate, blockMinutes }) };
}

/** The question rendered: one miss per token, however often this is retried. An answer carrying the token resets it. */
export async function spendDuration(tx: Tx, userId: string, token: string): Promise<void> {
    if ((await readMemoryState(tx, userId)).mode !== "full") return;
    const settings = await lockedSettings(tx, userId);
    const state = askStateOf(settings);
    if (!state || state.token !== token || state.shownToken === token) return;
    await writeAsk(tx, userId, settings, { ...state, misses: state.misses + 1, shownToken: token });
}

const sameInstant = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

/** A task report row: the subject check guarantees both columns. */
const viewOf = (row: { taskId: string | null; completedAt: string | null; lowMinutes: number; highMinutes: number; anchored: boolean }): DurationReportView => ({
    taskId: row.taskId!,
    completedAt: row.completedAt!,
    lowMinutes: row.lowMinutes,
    highMinutes: row.highMinutes,
    anchored: row.anchored,
});

/**
 * Stores one answer for one completion and returns what was stored. A completion that is gone (undone, or undone and
 * done again) is a 409 the client closes quietly. Basic and Off store nothing and say nothing about why (null).
 */
export async function reportDuration(tx: Tx, userId: string, body: DurationReport, now = new Date()): Promise<DurationReportView | null> {
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, body.taskId), eq(tasks.userId, userId)));
    if (!task) throw new AppError(404, "NOT_FOUND", "Task not found");
    // A pre-0.36.0 desktop build sends no instant: it means the current completion (D18).
    if (task.state !== "COMPLETE" || !task.completedAt || (body.completedAt && !sameInstant(body.completedAt, task.completedAt))) {
        throw new AppError(409, "CONFLICT", "This task was reopened");
    }
    if ((await readMemoryState(tx, userId)).mode !== "full") return null;

    const low = body.value ? (body.value.kind === "point" ? body.value.minutes : body.value.lowMinutes) : body.minutes!;
    const high = body.value ? (body.value.kind === "point" ? body.value.minutes : body.value.highMinutes) : body.minutes!;
    const today = todayIn(await userZone(tx, userId), now);
    const values = {
        lowMinutes: low,
        highMinutes: high,
        anchored: body.anchored,
        title: task.title.slice(0, 200),
        projectId: task.projectId,
        groupKey: groupOfTask(task),
        saidOn: today,
    };
    const [row] = await tx
        .insert(durationReports)
        .values({ userId, taskId: task.id, completedAt: task.completedAt, ...values })
        .onConflictDoUpdate({ target: [durationReports.taskId, durationReports.completedAt], set: { ...values, forgottenAt: null, updatedAt: sql`now()` } })
        .returning();

    // Answering the question itself ends the back-off; editing a Took row later does not.
    if (body.token) {
        const settings = await lockedSettings(tx, userId);
        const state = askStateOf(settings);
        if (state && state.token === body.token && state.misses > 0) await writeAsk(tx, userId, settings, { ...state, misses: 0 });
    }
    return viewOf(row);
}

/** One completion's report (the task's current completion when none is named), or null. */
export async function getReport(tx: Tx, userId: string, taskId: string, completedAt?: string): Promise<DurationReportView | null> {
    const [row] = await tx
        .select()
        .from(durationReports)
        .innerJoin(tasks, and(eq(tasks.id, durationReports.taskId), eq(tasks.userId, userId)))
        .where(and(visible(userId), eq(durationReports.taskId, taskId), completedAt ? sql`date_trunc('milliseconds', ${durationReports.completedAt}) = ${new Date(completedAt).toISOString()}::timestamptz` : eq(durationReports.completedAt, tasks.completedAt)));
    return row ? viewOf(row.duration_reports) : null;
}

/** Deletes one completion's report (the task's current one when none is named). Deleting a missing one is fine. */
export async function deleteReport(tx: Tx, userId: string, taskId: string, completedAt?: string): Promise<void> {
    const [task] = await tx.select({ completedAt: tasks.completedAt }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    const at = completedAt ?? task?.completedAt;
    if (!at) return;
    await tx.delete(durationReports).where(and(
        eq(durationReports.userId, userId),
        eq(durationReports.taskId, taskId),
        sql`date_trunc('milliseconds', ${durationReports.completedAt}) = ${new Date(at).toISOString()}::timestamptz`,
    ));
}

/** The estimator's input: the newest 1,000 answers of the last year, tasks and routines together (Full only, else nothing). A routine's id stands where a task's would, as a repeating thing. */
export async function durationEvidence(tx: Tx, userId: string, now = new Date()): Promise<DurationEvidenceRow[]> {
    if ((await readMemoryState(tx, userId)).mode !== "full") return [];
    const since = addDays(todayIn(await userZone(tx, userId), now), -365);
    const columns = {
        title: durationReports.title,
        projectId: durationReports.projectId,
        lowMinutes: durationReports.lowMinutes,
        highMinutes: durationReports.highMinutes,
        anchored: durationReports.anchored,
        saidOn: durationReports.saidOn,
        createdAt: durationReports.createdAt,
    };
    const taskRows = await tx
        .select({ taskId: sql<string>`${durationReports.taskId}`, series: sql<boolean>`${tasks.recurrenceRule} IS NOT NULL`, ...columns })
        .from(durationReports)
        .innerJoin(tasks, eq(tasks.id, durationReports.taskId))
        .where(and(visible(userId), gt(durationReports.saidOn, since)))
        .orderBy(desc(durationReports.saidOn), desc(durationReports.createdAt))
        .limit(1000);
    const routineRows = await tx
        .select({ taskId: sql<string>`${durationReports.habitId}`, series: sql<boolean>`true`, ...columns })
        .from(durationReports)
        .innerJoin(habits, eq(habits.id, durationReports.habitId))
        .where(and(visible(userId), gt(durationReports.saidOn, since)))
        .orderBy(desc(durationReports.saidOn), desc(durationReports.createdAt))
        .limit(1000);
    return [...taskRows, ...routineRows]
        .sort((a, b) => b.saidOn.localeCompare(a.saidOn) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 1000)
        .map((row): DurationEvidenceRow => ({ taskId: row.taskId, title: row.title, projectId: row.projectId, series: row.series, lowMinutes: row.lowMinutes, highMinutes: row.highMinutes, anchored: row.anchored, saidOn: row.saidOn }));
}

// ── Routines: "Took 30 min" on a marked day ──

const routineViewOf = (row: { habitId: string | null; targetDate: string | null; wallTime: string | null; lowMinutes: number; highMinutes: number; anchored: boolean }): RoutineDurationView => ({
    habitId: row.habitId!,
    day: row.targetDate!,
    time: row.wallTime,
    lowMinutes: row.lowMinutes,
    highMinutes: row.highMinutes,
    anchored: row.anchored,
});

const routineKey = (userId: string, key: RoutineDurationKey) => and(
    eq(durationReports.userId, userId),
    eq(durationReports.habitId, key.habitId),
    eq(durationReports.targetDate, key.day),
    key.time ? eq(durationReports.wallTime, key.time) : isNull(durationReports.wallTime),
);

/** Is this routine day (or marked time) done? Only a marked occurrence can have an answer. */
async function routineDone(tx: Tx, userId: string, key: RoutineDurationKey): Promise<boolean> {
    const [log] = await tx.select({ status: habitLogs.status, timeMarks: habitLogs.timeMarks }).from(habitLogs)
        .where(and(eq(habitLogs.userId, userId), eq(habitLogs.habitId, key.habitId), eq(habitLogs.targetDate, key.day)));
    if (!log) return false;
    return key.time ? log.timeMarks?.[key.time]?.status === "COMPLETED" : log.status === "COMPLETED";
}

/** Stores how long a routine took on one marked day. Not marked done is a 409 the app closes quietly; Basic and Off store nothing (null). */
export async function reportRoutine(tx: Tx, userId: string, body: RoutineDuration, now = new Date()): Promise<RoutineDurationView | null> {
    const key = { habitId: body.habitId, day: body.day, time: body.time ?? null };
    const [habit] = await tx.select({ id: habits.id, title: habits.title }).from(habits).where(and(eq(habits.id, body.habitId), eq(habits.userId, userId)));
    if (!habit) throw new AppError(404, "NOT_FOUND", "Routine not found");
    if (!(await routineDone(tx, userId, key))) throw new AppError(409, "CONFLICT", "This routine isn't marked done for that day");
    if ((await readMemoryState(tx, userId)).mode !== "full") return null;

    const low = body.value.kind === "point" ? body.value.minutes : body.value.lowMinutes;
    const high = body.value.kind === "point" ? body.value.minutes : body.value.highMinutes;
    const values = {
        lowMinutes: low,
        highMinutes: high,
        anchored: body.anchored ?? false,
        title: habit.title.slice(0, 200),
        projectId: null,
        groupKey: `series:${habit.id}`,
        saidOn: todayIn(await userZone(tx, userId), now),
    };
    const [existing] = await tx.select({ id: durationReports.id }).from(durationReports).where(routineKey(userId, key));
    const [row] = existing
        ? await tx.update(durationReports).set({ ...values, forgottenAt: null, updatedAt: sql`now()` }).where(eq(durationReports.id, existing.id)).returning()
        : await tx.insert(durationReports).values({ userId, habitId: habit.id, targetDate: key.day, wallTime: key.time, ...values }).returning();
    return routineViewOf(row);
}

export async function getRoutineReport(tx: Tx, userId: string, key: RoutineDurationKey): Promise<RoutineDurationView | null> {
    const [row] = await tx.select().from(durationReports).where(and(visible(userId), routineKey(userId, key)));
    return row ? routineViewOf(row) : null;
}

export async function deleteRoutineReport(tx: Tx, userId: string, key: RoutineDurationKey): Promise<void> {
    await tx.delete(durationReports).where(routineKey(userId, key));
}

/**
 * A routine's log changed: any answer for an occurrence that is no longer marked done goes with it (Clear, Skip, an
 * undone time). Called from the one service that writes logs, so routes, the assistant and MCP all agree.
 */
export async function pruneRoutineReports(tx: Tx, userId: string, habitId: string, day: string, log: { status: string; timeMarks: Record<string, { status: string }> | null }): Promise<void> {
    const rows = await tx.select({ id: durationReports.id, wallTime: durationReports.wallTime }).from(durationReports)
        .where(and(eq(durationReports.userId, userId), eq(durationReports.habitId, habitId), eq(durationReports.targetDate, day)));
    const gone = rows.filter((r) => (r.wallTime ? log.timeMarks?.[r.wallTime]?.status !== "COMPLETED" : log.status !== "COMPLETED"));
    if (gone.length) await tx.delete(durationReports).where(inArray(durationReports.id, gone.map((r) => r.id)));
}

/** Forget a duration fact: its group's answers are hidden at once (Undo brings them back; the scrub deletes them). */
export async function hideGroupReports(tx: Tx, userId: string, group: string): Promise<void> {
    await tx.update(durationReports).set({ forgottenAt: sql`now()` }).where(and(eq(durationReports.userId, userId), eq(durationReports.groupKey, group), isNull(durationReports.forgottenAt)));
}

/** Undo of Forget. */
export async function showGroupReports(tx: Tx, userId: string, group: string): Promise<void> {
    await tx.update(durationReports).set({ forgottenAt: null }).where(and(eq(durationReports.userId, userId), eq(durationReports.groupKey, group), isNotNull(durationReports.forgottenAt)));
}

/** Clear all: every answer, now. */
export async function clearReports(tx: Tx, userId: string): Promise<void> {
    await tx.delete(durationReports).where(eq(durationReports.userId, userId));
}

/** The answers the nightly pass turns into facts: every visible one of the last year, with the group it belongs to. */
export async function readReports(tx: Tx, userId: string, today: LocalDate): Promise<ReportRow[]> {
    const rows = await tx
        .select({
            taskId: sql<string>`coalesce(${durationReports.taskId}, ${durationReports.habitId})`,
            title: durationReports.title,
            projectId: durationReports.projectId,
            series: sql<boolean>`${durationReports.groupKey} LIKE 'series:%'`,
            low: durationReports.lowMinutes,
            high: durationReports.highMinutes,
            anchored: durationReports.anchored,
            day: durationReports.saidOn,
            group: durationReports.groupKey,
        })
        .from(durationReports)
        .where(and(visible(userId), gt(durationReports.saidOn, addDays(today, -365))))
        .orderBy(desc(durationReports.saidOn))
        .limit(2000);
    return rows;
}

/** What the assistant may know about a task's length: the guess Cadence is sure of, and what a finished one took. */
export interface DurationHint { takesAbout?: number; took?: number | string }

/**
 * For the tasks the assistant is about to read (Full only, else nothing): `takesAbout` on an open untimed task with no
 * length of its own when the estimator is `supported`, `took` on a done one with an answer ("45", or "30–60" for a range).
 * Both are left out when absent, like every default in a projection.
 */
export async function durationHints(
    tx: Tx,
    userId: string,
    rows: readonly { id: string; title: string; projectId: string | null; state: string; recurrenceRule: string | null; durationEstimate: number | null; scheduledStart: string | null; interactionMode: string }[],
    now = new Date(),
): Promise<Map<string, DurationHint>> {
    const hints = new Map<string, DurationHint>();
    if (!rows.length || (await readMemoryState(tx, userId)).mode !== "full") return hints;

    const done = rows.filter((r) => r.state === "COMPLETE");
    if (done.length) {
        const reports = await tx
            .select({ taskId: durationReports.taskId, low: durationReports.lowMinutes, high: durationReports.highMinutes })
            .from(durationReports)
            .innerJoin(tasks, and(eq(tasks.id, durationReports.taskId), eq(tasks.completedAt, durationReports.completedAt)))
            .where(and(visible(userId), inArray(durationReports.taskId, done.map((r) => r.id))));
        for (const r of reports) hints.set(r.taskId!, { took: r.low === r.high ? r.low : `${r.low}–${r.high}` });
    }

    const open = rows.filter((r) => (r.state === "ACTIVE" || r.state === "WAITING") && !r.scheduledStart && !r.durationEstimate && r.interactionMode !== "timetable");
    if (open.length) {
        const today = todayIn(await userZone(tx, userId), now);
        const evidence = (await durationEvidence(tx, userId, now)).map((e) => ({ taskId: e.taskId, title: e.title, projectId: e.projectId, series: e.series, low: e.lowMinutes, high: e.highMinutes, anchored: e.anchored, day: e.saidOn }));
        for (const r of open) {
            const guess = estimateDuration({ taskId: r.recurrenceRule ? r.id : null, title: r.title, projectId: r.projectId }, evidence, today);
            if (guess?.state === "supported") hints.set(r.id, { ...hints.get(r.id), takesAbout: guess.minutes });
        }
    }
    return hints;
}
