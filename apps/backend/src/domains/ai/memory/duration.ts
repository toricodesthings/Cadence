import { and, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type {
    DurationEvidenceRow,
    DurationReport,
    DurationReportView,
    DurationValue,
    RoutineDuration,
    RoutineDurationKey,
    RoutineDurationView,
} from "@cadence/contracts/memory";
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
    const raw = (settings as { assistant?: { durationAsk?: Partial<DurationAskState> | null } } | null)?.assistant
        ?.durationAsk;
    return raw
        ? { lastOn: raw.lastOn ?? null, misses: raw.misses ?? 0, token: raw.token, shownToken: raw.shownToken }
        : null;
};

const visible = (userId: string) => and(eq(durationReports.userId, userId), isNull(durationReports.forgottenAt));

const centre = (low: number, high: number) => (low === high ? low : Math.round(Math.sqrt(low * high)));

async function historyOf(tx: Tx, userId: string, group: string, today: LocalDate): Promise<GroupHistory> {
    const rows = await tx
        .select({ low: durationReports.lowMinutes, high: durationReports.highMinutes, saidOn: durationReports.saidOn })
        .from(durationReports)
        .where(and(visible(userId), eq(durationReports.groupKey, group)));
    const newest = rows
        .map((r) => r.saidOn)
        .sort()
        .at(-1);
    return {
        minutes: rows.map((r) => centre(r.low, r.high)),
        newestDaysAgo: newest ? daysBetween(newest, today) : null,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
const writeAsk = (tx: Tx, userId: string, settings: Record<string, any>, value: DurationAskState) =>
    tx
        .update(users)
        .set({ settings: { ...settings, assistant: { ...settings.assistant, durationAsk: value } } })
        .where(eq(users.id, userId));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
async function lockedSettings(tx: Tx, userId: string): Promise<Record<string, any>> {
    const [row] = await tx
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .for("update");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    return (row?.settings ?? {}) as Record<string, any>;
}

export async function askDuration(
    tx: Tx,
    userId: string,
    taskId: string,
    now = new Date(),
): Promise<{ token: string; completedAt: string; reference: number | null } | null> {
    const settings = await lockedSettings(tx, userId);
    const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    if (!task || task.state !== "COMPLETE" || !task.completedAt) return null;
    if ((await readMemoryState(tx, userId)).mode !== "full") return null;

    const today = todayIn(await userZone(tx, userId), now);
    const history = await historyOf(tx, userId, groupOfTask(task), today);
    const state = askStateOf(settings);
    const ageMs = new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
    if (!shouldAsk({ state, today, ageMs, history })) return null;

    const token = crypto.randomUUID();
    await writeAsk(tx, userId, settings, {
        lastOn: today,
        misses: state?.misses ?? 0,
        token,
        shownToken: state?.shownToken,
    });
    const blockMinutes =
        task.scheduledStart && task.scheduledEnd
            ? Math.round((new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime()) / 60_000)
            : null;
    return {
        token,
        completedAt: task.completedAt,
        reference: referenceMinutes({ durationEstimate: task.durationEstimate, blockMinutes }),
    };
}

export async function spendDuration(tx: Tx, userId: string, token: string): Promise<void> {
    if ((await readMemoryState(tx, userId)).mode !== "full") return;
    const settings = await lockedSettings(tx, userId);
    const state = askStateOf(settings);
    if (!state || state.token !== token || state.shownToken === token) return;
    await writeAsk(tx, userId, settings, { ...state, misses: state.misses + 1, shownToken: token });
}

const sameInstant = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

const viewOf = (row: {
    taskId: string | null;
    completedAt: string | null;
    lowMinutes: number;
    highMinutes: number;
    anchored: boolean;
}): DurationReportView => ({
    taskId: row.taskId!,
    completedAt: row.completedAt!,
    lowMinutes: row.lowMinutes,
    highMinutes: row.highMinutes,
    anchored: row.anchored,
});

const boundsOf = (value: DurationValue): [number, number] =>
    value.kind === "point" ? [value.minutes, value.minutes] : [value.lowMinutes, value.highMinutes];

export async function reportDuration(
    tx: Tx,
    userId: string,
    body: DurationReport,
    now = new Date(),
): Promise<DurationReportView | null> {
    const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, body.taskId), eq(tasks.userId, userId)));
    if (!task) throw new AppError(404, "NOT_FOUND", "Task not found");
    if (task.state !== "COMPLETE" || !task.completedAt || !sameInstant(body.completedAt, task.completedAt)) {
        throw new AppError(409, "CONFLICT", "This task was reopened");
    }
    if ((await readMemoryState(tx, userId)).mode !== "full") return null;

    const [low, high] = boundsOf(body.value);
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
        .onConflictDoUpdate({
            target: [durationReports.taskId, durationReports.completedAt],
            set: { ...values, forgottenAt: null, updatedAt: sql`now()` },
        })
        .returning();

    if (body.token) {
        const settings = await lockedSettings(tx, userId);
        const state = askStateOf(settings);
        if (state && state.token === body.token && state.misses > 0)
            await writeAsk(tx, userId, settings, { ...state, misses: 0 });
    }
    return viewOf(row);
}

export async function getReport(
    tx: Tx,
    userId: string,
    taskId: string,
    completedAt?: string,
): Promise<DurationReportView | null> {
    const [row] = await tx
        .select()
        .from(durationReports)
        .innerJoin(tasks, and(eq(tasks.id, durationReports.taskId), eq(tasks.userId, userId)))
        .where(
            and(
                visible(userId),
                eq(durationReports.taskId, taskId),
                completedAt
                    ? sql`date_trunc('milliseconds', ${durationReports.completedAt}) = ${new Date(completedAt).toISOString()}::timestamptz`
                    : eq(durationReports.completedAt, tasks.completedAt),
            ),
        );
    return row ? viewOf(row.duration_reports) : null;
}

export async function deleteReport(tx: Tx, userId: string, taskId: string, completedAt?: string): Promise<void> {
    const [task] = await tx
        .select({ completedAt: tasks.completedAt })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    const at = completedAt ?? task?.completedAt;
    if (!at) return;
    await tx
        .delete(durationReports)
        .where(
            and(
                eq(durationReports.userId, userId),
                eq(durationReports.taskId, taskId),
                sql`date_trunc('milliseconds', ${durationReports.completedAt}) = ${new Date(at).toISOString()}::timestamptz`,
            ),
        );
}

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
        .select({
            taskId: sql<string>`${durationReports.taskId}`,
            series: sql<boolean>`${tasks.recurrenceRule} IS NOT NULL`,
            ...columns,
        })
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
        .map((row): DurationEvidenceRow => ({
            taskId: row.taskId,
            title: row.title,
            projectId: row.projectId,
            series: row.series,
            lowMinutes: row.lowMinutes,
            highMinutes: row.highMinutes,
            anchored: row.anchored,
            saidOn: row.saidOn,
        }));
}

const routineViewOf = (row: {
    habitId: string | null;
    targetDate: string | null;
    wallTime: string | null;
    lowMinutes: number;
    highMinutes: number;
    anchored: boolean;
}): RoutineDurationView => ({
    habitId: row.habitId!,
    day: row.targetDate!,
    time: row.wallTime,
    lowMinutes: row.lowMinutes,
    highMinutes: row.highMinutes,
    anchored: row.anchored,
});

const routineKey = (userId: string, key: RoutineDurationKey) =>
    and(
        eq(durationReports.userId, userId),
        eq(durationReports.habitId, key.habitId),
        eq(durationReports.targetDate, key.day),
        key.time ? eq(durationReports.wallTime, key.time) : isNull(durationReports.wallTime),
    );

async function routineDone(tx: Tx, userId: string, key: RoutineDurationKey): Promise<boolean> {
    const [log] = await tx
        .select({ status: habitLogs.status, timeMarks: habitLogs.timeMarks })
        .from(habitLogs)
        .where(
            and(eq(habitLogs.userId, userId), eq(habitLogs.habitId, key.habitId), eq(habitLogs.targetDate, key.day)),
        );
    if (!log) return false;
    return key.time ? log.timeMarks?.[key.time]?.status === "COMPLETED" : log.status === "COMPLETED";
}

export async function reportRoutine(
    tx: Tx,
    userId: string,
    body: RoutineDuration,
    now = new Date(),
): Promise<RoutineDurationView | null> {
    const key = { habitId: body.habitId, day: body.day, time: body.time ?? null };
    const [habit] = await tx
        .select({ id: habits.id, title: habits.title })
        .from(habits)
        .where(and(eq(habits.id, body.habitId), eq(habits.userId, userId)));
    if (!habit) throw new AppError(404, "NOT_FOUND", "Routine not found");
    if (!(await routineDone(tx, userId, key)))
        throw new AppError(409, "CONFLICT", "This routine isn't marked done for that day");
    if ((await readMemoryState(tx, userId)).mode !== "full") return null;

    const [low, high] = boundsOf(body.value);
    const values = {
        lowMinutes: low,
        highMinutes: high,
        anchored: body.anchored ?? false,
        title: habit.title.slice(0, 200),
        projectId: null,
        groupKey: `series:${habit.id}`,
        saidOn: todayIn(await userZone(tx, userId), now),
    };
    const [inserted] = await tx
        .insert(durationReports)
        .values({ userId, habitId: habit.id, targetDate: key.day, wallTime: key.time, ...values })
        .onConflictDoNothing()
        .returning();
    const [row] = inserted
        ? [inserted]
        : await tx
              .update(durationReports)
              .set({ ...values, forgottenAt: null, updatedAt: sql`now()` })
              .where(routineKey(userId, key))
              .returning();
    return routineViewOf(row);
}

export async function getRoutineReport(
    tx: Tx,
    userId: string,
    key: RoutineDurationKey,
): Promise<RoutineDurationView | null> {
    const [row] = await tx
        .select()
        .from(durationReports)
        .where(and(visible(userId), routineKey(userId, key)));
    return row ? routineViewOf(row) : null;
}

export async function deleteRoutineReport(tx: Tx, userId: string, key: RoutineDurationKey): Promise<void> {
    await tx.delete(durationReports).where(routineKey(userId, key));
}

export async function pruneRoutineReports(
    tx: Tx,
    userId: string,
    habitId: string,
    day: string,
    log: { status: string; timeMarks: Record<string, { status: string }> | null },
): Promise<void> {
    const rows = await tx
        .select({ id: durationReports.id, wallTime: durationReports.wallTime })
        .from(durationReports)
        .where(
            and(
                eq(durationReports.userId, userId),
                eq(durationReports.habitId, habitId),
                eq(durationReports.targetDate, day),
            ),
        );
    const gone = rows.filter((r) =>
        r.wallTime ? log.timeMarks?.[r.wallTime]?.status !== "COMPLETED" : log.status !== "COMPLETED",
    );
    if (gone.length)
        await tx.delete(durationReports).where(
            and(
                eq(durationReports.userId, userId),
                inArray(
                    durationReports.id,
                    gone.map((r) => r.id),
                ),
            ),
        );
}

export async function hideGroupReports(tx: Tx, userId: string, group: string): Promise<void> {
    await tx
        .update(durationReports)
        .set({ forgottenAt: sql`now()` })
        .where(
            and(
                eq(durationReports.userId, userId),
                eq(durationReports.groupKey, group),
                isNull(durationReports.forgottenAt),
            ),
        );
}

export async function showGroupReports(tx: Tx, userId: string, group: string): Promise<void> {
    await tx
        .update(durationReports)
        .set({ forgottenAt: null })
        .where(
            and(
                eq(durationReports.userId, userId),
                eq(durationReports.groupKey, group),
                isNotNull(durationReports.forgottenAt),
            ),
        );
}

export async function clearReports(tx: Tx, userId: string): Promise<void> {
    await tx.delete(durationReports).where(eq(durationReports.userId, userId));
}

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

export interface DurationHint {
    takesAbout?: number;
    took?: number | string;
}

export async function durationHints(
    tx: Tx,
    userId: string,
    rows: readonly {
        id: string;
        title: string;
        projectId: string | null;
        state: string;
        recurrenceRule: string | null;
        durationEstimate: number | null;
        scheduledStart: string | null;
        interactionMode: string;
    }[],
    now = new Date(),
): Promise<Map<string, DurationHint>> {
    const hints = new Map<string, DurationHint>();
    if (!rows.length || (await readMemoryState(tx, userId)).mode !== "full") return hints;

    const done = rows.filter((r) => r.state === "COMPLETE");
    if (done.length) {
        const reports = await tx
            .select({
                taskId: durationReports.taskId,
                low: durationReports.lowMinutes,
                high: durationReports.highMinutes,
            })
            .from(durationReports)
            .innerJoin(
                tasks,
                and(eq(tasks.id, durationReports.taskId), eq(tasks.completedAt, durationReports.completedAt)),
            )
            .where(
                and(
                    visible(userId),
                    inArray(
                        durationReports.taskId,
                        done.map((r) => r.id),
                    ),
                ),
            );
        for (const r of reports) hints.set(r.taskId!, { took: r.low === r.high ? r.low : `${r.low}–${r.high}` });
    }

    const open = rows.filter(
        (r) =>
            (r.state === "ACTIVE" || r.state === "WAITING") &&
            !r.scheduledStart &&
            !r.durationEstimate &&
            r.interactionMode !== "timetable",
    );
    if (open.length) {
        const today = todayIn(await userZone(tx, userId), now);
        const evidence = (await durationEvidence(tx, userId, now)).map((e) => ({
            taskId: e.taskId,
            title: e.title,
            projectId: e.projectId,
            series: e.series,
            low: e.lowMinutes,
            high: e.highMinutes,
            anchored: e.anchored,
            day: e.saidOn,
        }));
        for (const r of open) {
            const guess = estimateDuration(
                { taskId: r.recurrenceRule ? r.id : null, title: r.title, projectId: r.projectId },
                evidence,
                today,
            );
            if (guess?.state === "supported") hints.set(r.id, { ...hints.get(r.id), takesAbout: guess.minutes });
        }
    }
    return hints;
}
