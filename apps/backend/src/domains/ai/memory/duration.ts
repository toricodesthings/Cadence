/**
 * "How long did it take?": the server's half. It decides whether a question may be asked
 * (`@cadence/domain/duration-ask`), reserves the day when it does, and keeps one confirmed report per completion
 * (`duration_reports`, keyed by the task and the instant it entered Done). Reports are the person's own words, so
 * they live outside the signals' 90-day prune.
 */
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import type { DurationEvidenceRow, DurationReport, DurationReportView } from "@cadence/contracts/memory";
import { shouldAsk, referenceMinutes, type DurationAskState, type GroupHistory } from "@cadence/domain/duration-ask";
import { addDays, daysBetween, todayIn, type LocalDate } from "@cadence/domain/time";
import { durationReports, tasks, users } from "../../../db/schema";
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

const viewOf = (row: { taskId: string; completedAt: string; lowMinutes: number; highMinutes: number; anchored: boolean }): DurationReportView => ({
    taskId: row.taskId,
    completedAt: row.completedAt,
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

/** The estimator's input: the newest 1,000 answers of the last year (Full only, else nothing). */
export async function durationEvidence(tx: Tx, userId: string, now = new Date()): Promise<DurationEvidenceRow[]> {
    if ((await readMemoryState(tx, userId)).mode !== "full") return [];
    const since = addDays(todayIn(await userZone(tx, userId), now), -365);
    const rows = await tx
        .select({
            taskId: durationReports.taskId,
            title: durationReports.title,
            projectId: durationReports.projectId,
            series: sql<boolean>`${tasks.recurrenceRule} IS NOT NULL`,
            lowMinutes: durationReports.lowMinutes,
            highMinutes: durationReports.highMinutes,
            anchored: durationReports.anchored,
            saidOn: durationReports.saidOn,
        })
        .from(durationReports)
        .innerJoin(tasks, eq(tasks.id, durationReports.taskId))
        .where(and(visible(userId), gt(durationReports.saidOn, since)))
        .orderBy(desc(durationReports.saidOn), desc(durationReports.createdAt))
        .limit(1000);
    return rows;
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
            taskId: durationReports.taskId,
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
