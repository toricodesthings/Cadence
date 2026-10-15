/**
 * "How long did it take?": the server's half. It decides whether a toast may be asked (`@cadence/domain/duration-ask`),
 * spends the day once the toast has rendered, and keeps one report per thing done. Reports are
 * `ai_memory_signals` rows of kind `duration`, written through `recordPersonActivity` (Full only).
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { shouldAsk, referenceMinutes, type DurationAskState, type GroupHistory } from "@cadence/domain/duration-ask";
import { daysBetween, dayOf, todayIn, type LocalDate } from "@cadence/domain/time";
import { aiMemorySignals, taskMetrics, tasks, users } from "../../../db/schema";
import { userZone } from "../../../platform/user-zone";
import type { Tx } from "../../../types/db";
import { groupOfTask } from "./signals";
import { readMemoryState } from "./memory-mode";

const askStateOf = (settings: unknown): DurationAskState | null => {
    const raw = (settings as { assistant?: { durationAsk?: Partial<DurationAskState> | null } } | null)?.assistant?.durationAsk;
    return raw ? { lastOn: raw.lastOn ?? null, misses: raw.misses ?? 0 } : null;
};

/** What the group already holds: its reports' minutes and how old the newest is. */
async function historyOf(tx: Tx, userId: string, group: string, today: LocalDate): Promise<GroupHistory> {
    const rows = await tx
        .select({ minutes: aiMemorySignals.minutes, on: aiMemorySignals.on })
        .from(aiMemorySignals)
        .where(and(eq(aiMemorySignals.userId, userId), eq(aiMemorySignals.kind, "duration"), eq(aiMemorySignals.subject, group)));
    const minutes = rows.flatMap((r) => (r.minutes ? [r.minutes] : []));
    const newest = rows.map((r) => r.on).sort().at(-1);
    return { minutes, newestDaysAgo: newest ? daysBetween(newest, today) : null };
}

/** Should the toast be asked for this just-completed task? Never says why: asking must not reveal the mode. */
export async function askDuration(tx: Tx, userId: string, taskId: string, now = new Date()): Promise<{ token: string; reference: number | null } | null> {
    const [row] = await tx
        .select({ settings: users.settings, task: tasks })
        .from(tasks)
        .innerJoin(users, eq(users.id, tasks.userId))
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    if (!row || row.task.state !== "COMPLETE") return null;
    if ((await readMemoryState(tx, userId)).mode !== "full") return null;

    const { task } = row;
    const today = todayIn(await userZone(tx, userId), now);
    const history = await historyOf(tx, userId, groupOfTask(task), today);
    const ageMs = now.getTime() - new Date(task.createdAt).getTime();
    if (!shouldAsk({ state: askStateOf(row.settings), today, ageMs, history })) return null;

    const blockMinutes = task.scheduledStart && task.scheduledEnd
        ? Math.round((new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime()) / 60_000)
        : null;
    return { token: `${taskId}:${today}`, reference: referenceMinutes({ durationEstimate: task.durationEstimate, blockMinutes }, history) };
}

/** Edits `durationAsk` under the row lock, so two devices can't interleave. */
async function writeAskState(tx: Tx, userId: string, next: (current: DurationAskState | null, today: LocalDate) => DurationAskState | null, now = new Date()) {
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1).for("update");
    const settings = (row?.settings ?? {}) as Record<string, any>;
    const today = todayIn(await userZone(tx, userId), now);
    const value = next(askStateOf(settings), today);
    if (!value) return;
    await tx.update(users).set({ settings: { ...settings, assistant: { ...(settings.assistant ?? {}), durationAsk: value } } }).where(eq(users.id, userId));
}

/** The toast rendered: today is spent, and until it's answered it counts as a miss. */
export async function spendDuration(tx: Tx, userId: string, token: string, now = new Date()): Promise<void> {
    if ((await readMemoryState(tx, userId)).mode !== "full") return;
    const day = token.split(":")[1];
    await writeAskState(tx, userId, (current, today) => (day === today ? { lastOn: today, misses: (current?.misses ?? 0) + 1 } : null), now);
}

/** Any answer resets the back-off. */
export async function answeredDuration(tx: Tx, userId: string): Promise<void> {
    await writeAskState(tx, userId, (current) => (current && current.misses > 0 ? { ...current, misses: 0 } : null));
}

/** The task's group and the day its report belongs to: the day it was completed, so a late edit keeps the same row. */
export async function reportTarget(tx: Tx, userId: string, taskId: string, now = new Date()) {
    const [task] = await tx.select({ id: tasks.id, title: tasks.title, recurrenceRule: tasks.recurrenceRule, state: tasks.state }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    if (!task) return null;
    const zone = await userZone(tx, userId);
    const [metrics] = task.state === "COMPLETE" ? await tx.select({ completedAt: taskMetrics.completedAt }).from(taskMetrics).where(eq(taskMetrics.taskId, taskId)) : [];
    return { subject: groupOfTask(task), on: metrics?.completedAt ? dayOf(new Date(metrics.completedAt).toISOString(), zone) : todayIn(zone, now) };
}

/** The newest report for a task (a repeating task has one per completion). */
export async function reportedMinutes(tx: Tx, userId: string, taskId: string): Promise<number | null> {
    const [row] = await tx
        .select({ minutes: aiMemorySignals.minutes })
        .from(aiMemorySignals)
        .where(and(eq(aiMemorySignals.userId, userId), eq(aiMemorySignals.kind, "duration"), eq(aiMemorySignals.taskId, taskId)))
        .orderBy(desc(aiMemorySignals.on), desc(aiMemorySignals.createdAt))
        .limit(1);
    return row?.minutes ?? null;
}

/** Drops the newest report of each task: undoing a completion undoes its answer. */
export async function dropReports(tx: Tx, userId: string, taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) return;
    await tx.execute(sql`
        DELETE FROM ai_memory_signals WHERE id IN (
            SELECT DISTINCT ON (task_id) id FROM ai_memory_signals
            WHERE user_id = ${userId} AND kind = 'duration' AND task_id IN ${sql`(${sql.join(taskIds.map((id) => sql`${id}`), sql`, `)})`}
            ORDER BY task_id, "on" DESC, created_at DESC)`);
}

/** A forgotten duration fact takes the reports behind it, or tonight's pass would rebuild it. */
export async function dropGroupReports(tx: Tx, userId: string, groups: string[]): Promise<void> {
    if (groups.length === 0) return;
    await tx.delete(aiMemorySignals).where(and(eq(aiMemorySignals.userId, userId), eq(aiMemorySignals.kind, "duration"), inArray(aiMemorySignals.subject, groups)));
}
