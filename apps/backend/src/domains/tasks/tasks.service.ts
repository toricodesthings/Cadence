import { OPEN_TASK_STATES } from "@cadence/contracts/task";
import { and, asc, eq, inArray, isNull, ne, notInArray, sql, type SQL } from "drizzle-orm";
import { tracing } from "cloudflare:workers";
import type {
    BatchReschedule,
    EffortLevel,
    InsertTask,
    PlaceTaskItem,
    Task,
    TaskPriority,
    TaskRow,
    TaskState,
    UpdateTask,
} from "@cadence/contracts/task";
import {
    hasTaskTemporalMutation,
    normalizeHiddenUntil,
    normalizeTaskTemporalFields,
    rescheduleToDay,
    type TaskTemporalFields,
} from "@cadence/domain/task-temporal";
import { addDays, daysBetween, type Zone } from "@cadence/domain/time";
import { validateTaskRecurrenceRule } from "@cadence/domain/task-recurrence";
import { suggestInteractionMode } from "@cadence/domain/repeats";
import { ORDER_INDEX_GAP } from "@cadence/domain/ordering";
import { aiMemoryNotes, subtasks, taskMetrics, taskNlpMetadata, taskPersonal, tasks, taskTags } from "../../db/schema";
import { AppError, assertNoConflict, sameVersion, throwIfNotFound } from "../../platform/errors";
import { insertWithClientId } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { userZone } from "../../platform/user-zone";
import { trackBatchCompletion, trackBatchEvents, trackReschedules } from "../../platform/metrics";
import { recordPersonActivity, type PersonActivity } from "../ai/memory/memory.service";
import type { DbClient, Tx } from "../../types/db";
import type { Env } from "../../types/env";
import { writeNote } from "../notes/notes.service";
import { placeTagIds, retagForMove } from "../tags/tags.service";
import { assertRowRoom, assertStorageRoom } from "../../platform/storage-ceiling";

const WHEN_COLUMNS = {
    dueDate: tasks.dueDate,
    endDate: tasks.endDate,
    scheduledStart: tasks.scheduledStart,
    scheduledEnd: tasks.scheduledEnd,
    zone: tasks.zone,
};

export { hasNoDay, inDayWindow, onOrBefore } from "./task-filters";
export { buildTaskWhereClause, readTasks } from "./tasks.read";

type NewTask = Omit<typeof tasks.$inferInsert, "userId"> & { effortOrigin?: "manual" | "accepted" | null };
type TaskPatch = Omit<UpdateTask, "expectedUpdatedAt" | "findTime">;

export function effortProvenance(effort: number | null | undefined, origin: "manual" | "accepted" | null | undefined) {
    return effort != null && origin
        ? { effortOrigin: origin, effortChosenAt: sql`NOW()` }
        : { effortOrigin: null, effortChosenAt: null };
}

export function guessAfterWrite(patch: {
    effort?: unknown;
    title?: unknown;
    projectId?: unknown;
    effortGuessSource?: "dismissed";
}) {
    if (patch.effortGuessSource)
        return { effortGuess: null, effortGuessSource: patch.effortGuessSource, effortGuessAt: null };
    if (patch.title !== undefined || patch.projectId !== undefined)
        return { effortGuess: null, effortGuessSource: null, effortGuessAt: null };
    if (patch.effort !== undefined && patch.effort !== null) {
        return {
            effortGuess: null,
            effortGuessSource: sql<"dismissed" | null>`nullif(${tasks.effortGuessSource}, 'model')`,
            effortGuessAt: null,
        };
    }
    return {};
}

export type TaskDraft = Partial<
    Pick<
        InsertTask,
        | "dueDate"
        | "endDate"
        | "scheduledStart"
        | "scheduledEnd"
        | "durationEstimate"
        | "projectId"
        | "sectionId"
        | "priority"
        | "effort"
        | "recurrenceRule"
        | "tagIds"
        | "reminderAt"
        | "notBefore"
    >
> & {
    title: string;
    subtasks?: string[];
    fixed?: boolean;
    note?: string;
};

export function temporalColumns(fields: TaskTemporalFields & { notBefore?: string | null }, zone: Zone) {
    const temporal = normalizeTaskTemporalFields(fields, zone);
    return "notBefore" in fields ? { ...temporal, notBefore: normalizeHiddenUntil(fields.notBefore) } : temporal;
}

export type TaskSlot = { scheduledStart: string | null; dueDate: string | null };

export async function slotsOf(tx: Tx, userId: string, taskIds: string[]): Promise<Map<string, TaskSlot>> {
    const rows = await tx
        .select({ id: tasks.id, scheduledStart: tasks.scheduledStart, dueDate: tasks.dueDate })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)));
    return new Map(rows.map((row) => [row.id, { scheduledStart: row.scheduledStart, dueDate: row.dueDate }]));
}

export function trackTaskChanges(
    waitUntil: (promise: Promise<unknown>) => void,
    db: DbClient,
    userId: string,
    changes: {
        created?: string[];
        rescheduled?: { id: string; scheduledStart: string | null; dueDate: string | null }[];
        completed?: string[];
        from?: Map<string, TaskSlot>;
    },
    byPerson?: { env: Env },
) {
    const { created = [], rescheduled = [], completed = [], from } = changes;
    if (byPerson) {
        const activity: PersonActivity[] = [
            ...rescheduled.flatMap((task) =>
                from?.get(task.id) ? [{ kind: "reschedule" as const, taskId: task.id, from: from.get(task.id)! }] : [],
            ),
            ...completed.map(() => ({ kind: "complete" as const })),
        ];
        if (activity.length) waitUntil(recordPersonActivity(byPerson.env, userId, activity));
    }
    if (rescheduled.length) {
        waitUntil(
            tracing.enterSpan("tasks.metrics.reschedule", () =>
                trackReschedules(
                    db,
                    userId,
                    rescheduled.map((task) => ({
                        taskId: task.id,
                        scheduledStart: task.scheduledStart,
                        dueDate: task.dueDate,
                    })),
                ),
            ),
        );
    }
    if (completed.length)
        waitUntil(tracing.enterSpan("tasks.metrics.completion", () => trackBatchCompletion(db, completed, userId)));
    const events = [
        ...created.map((taskId) => ({ event: "task.create", metadata: { taskId } })),
        ...rescheduled.map((task) => ({ event: "task.reschedule", metadata: { taskId: task.id } })),
        ...completed.map((taskId) => ({ event: "task.complete", metadata: { taskId } })),
    ];
    if (events.length) waitUntil(tracing.enterSpan("tasks.metrics.events", () => trackBatchEvents(db, userId, events)));
}

export function toTask(
    row: TaskRow & Pick<Task, "seriesId" | "isRecurringInstance" | "occurrenceStart" | "occurrenceEnd">,
    tagIds: string[],
): Task {
    return {
        ...row,
        priority: row.priority as TaskPriority,
        effort: row.effort as EffortLevel | null,
        effortGuess: row.effortGuess as EffortLevel | null,
        effortGuessSource: row.effortGuessSource as Task["effortGuessSource"],
        tagIds,
    };
}

export async function overlayPersonalReminders<
    T extends Pick<TaskRow, "id" | "userId" | "reminderAt" | "reminderSilenced">,
>(tx: Tx, callerId: string, rows: T[]): Promise<T[]> {
    const guestIds = rows.filter((row) => row.userId !== callerId).map((row) => row.id);
    if (!guestIds.length) return rows;
    const personal = await tx
        .select({
            taskId: taskPersonal.taskId,
            reminderAt: taskPersonal.reminderAt,
            reminderSilenced: taskPersonal.reminderSilenced,
        })
        .from(taskPersonal)
        .where(and(eq(taskPersonal.userId, callerId), inArray(taskPersonal.taskId, guestIds)));
    const byTask = new Map(personal.map((p) => [p.taskId, p]));
    return rows.map((row) => {
        if (row.userId === callerId) return row;
        const own = byTask.get(row.id);
        return {
            ...row,
            reminderAt: own?.reminderAt ?? null,
            reminderSilenced: own?.reminderSilenced ?? false,
        };
    });
}

export async function upsertPersonalReminder(
    tx: Tx,
    userId: string,
    taskId: string,
    fields: { reminderAt?: string | null; reminderSilenced?: boolean },
): Promise<{ reminderAt: string | null; reminderSilenced: boolean }> {
    if (fields.reminderAt === null) {
        await tx.delete(taskPersonal).where(and(eq(taskPersonal.taskId, taskId), eq(taskPersonal.userId, userId)));
        return { reminderAt: null, reminderSilenced: false };
    }
    const [existing] = await tx
        .select({ reminderAt: taskPersonal.reminderAt, reminderSilenced: taskPersonal.reminderSilenced })
        .from(taskPersonal)
        .where(and(eq(taskPersonal.taskId, taskId), eq(taskPersonal.userId, userId)));
    const reminderAt = fields.reminderAt !== undefined ? fields.reminderAt : (existing?.reminderAt ?? null);
    const reminderSilenced =
        fields.reminderSilenced !== undefined ? fields.reminderSilenced : (existing?.reminderSilenced ?? false);
    if (reminderAt === null) {
        await tx.delete(taskPersonal).where(and(eq(taskPersonal.taskId, taskId), eq(taskPersonal.userId, userId)));
        return { reminderAt: null, reminderSilenced: false };
    }
    const [row] = await tx
        .insert(taskPersonal)
        .values({ taskId, userId, reminderAt, reminderSilenced })
        .onConflictDoUpdate({
            target: [taskPersonal.taskId, taskPersonal.userId],
            set: { reminderAt, reminderSilenced },
        })
        .returning({ reminderAt: taskPersonal.reminderAt, reminderSilenced: taskPersonal.reminderSilenced });
    return row;
}

export async function withTagIds(tx: Tx, rows: TaskRow[]): Promise<Task[]> {
    const links = rows.length
        ? await tracing.enterSpan("tasks.tags.read", () =>
              tx
                  .select({ taskId: taskTags.taskId, tagId: taskTags.tagId })
                  .from(taskTags)
                  .where(
                      inArray(
                          taskTags.taskId,
                          rows.map((row) => row.id),
                      ),
                  ),
          )
        : [];
    return rows.map((row) =>
        toTask(
            row,
            links.filter((link) => link.taskId === row.id).map((link) => link.tagId),
        ),
    );
}

const isTimedFixedSeries = (t: {
    interactionMode?: string | null;
    recurrenceRule?: string | null;
    scheduledStart?: string | null;
}) => t.interactionMode === "timetable" && Boolean(t.recurrenceRule && t.scheduledStart);

export async function createTask(
    tx: Tx,
    userId: string,
    values: NewTask,
    tagIds: string[] = [],
    tagOwnerId: string = userId,
) {
    validateTaskRecurrenceRule(values.recurrenceRule, values.zone ?? "UTC");
    await assertOwnership(tx, userId, { projectId: values.projectId ?? null, sectionId: values.sectionId });
    if (tagIds.length) await assertOwnership(tx, tagOwnerId, { tagIds });
    const allTagIds = [...new Set([...tagIds, ...(await placeTagIds(tx, tagOwnerId, values))])];
    await assertRowRoom(tx, userId, "tasks");
    await assertStorageRoom(tx, userId, [values.content]);

    const interactionMode = values.interactionMode ?? suggestInteractionMode(values);
    const [row] = await insertWithClientId(() =>
        tx
            .insert(tasks)
            .values({
                ...values,
                ...(isTimedFixedSeries({ ...values, interactionMode }) && { dueDate: null, endDate: null }),
                interactionMode,
                userId,
                ...effortProvenance(values.effort, values.effortOrigin),
            })
            .returning(),
    );
    if (allTagIds.length > 0) {
        await tx.insert(taskTags).values(allTagIds.map((tagId) => ({ taskId: row.id, tagId })));
    }
    return { row, tagIds: allTagIds };
}

export async function createTasks(
    tx: Tx,
    userId: string,
    drafts: TaskDraft[],
    actor?: { createdBy?: string; tagOwnerId?: string },
) {
    const created: { taskId: string; title: string; subtaskIds: string[]; row: TaskRow; tagIds: string[] }[] = [];
    const createdBy = actor?.createdBy ?? userId;
    const tagOwnerId = actor?.tagOwnerId ?? userId;
    const guest = createdBy !== userId;
    const zone = await userZone(tx, createdBy);
    for (const {
        subtasks: steps = [],
        fixed,
        note,
        tagIds = [],
        dueDate,
        endDate,
        scheduledStart,
        scheduledEnd,
        notBefore,
        reminderAt,
        ...draft
    } of drafts) {
        const { row, tagIds: linkedTags } = await createTask(
            tx,
            userId,
            {
                ...draft,
                createdBy,
                orderIndex: 0,
                ...(guest ? {} : { reminderAt }),
                ...temporalColumns(
                    { dueDate, endDate, scheduledStart, scheduledEnd, ...(notBefore !== undefined && { notBefore }) },
                    zone,
                ),
                ...(fixed && { interactionMode: "timetable" as const }),
            },
            [...new Set(tagIds)],
            tagOwnerId,
        );
        if (guest && reminderAt) {
            await upsertPersonalReminder(tx, createdBy, row.id, { reminderAt });
        }
        const stepRows = steps.length
            ? await tx
                  .insert(subtasks)
                  .values(steps.map((title, orderIndex) => ({ taskId: row.id, userId, title, orderIndex })))
                  .returning({ id: subtasks.id })
            : [];
        if (note) await writeNote(tx, userId, row.id, note, { expectedVersion: 0 });
        created.push({
            taskId: row.id,
            title: row.title,
            subtaskIds: stepRows.map((step) => step.id),
            row,
            tagIds: linkedTags,
        });
    }
    return created;
}

export async function duplicateTask(tx: Tx, userId: string, id: string, title?: string) {
    const [original] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    throwIfNotFound(original, "Task");
    validateTaskRecurrenceRule(original.recurrenceRule, original.zone ?? "UTC");
    await assertRowRoom(tx, userId, "tasks");
    await assertStorageRoom(tx, userId, [original.content]);

    const [dup] = await tx
        .insert(tasks)
        .values({
            userId,
            projectId: original.projectId,
            sectionId: original.sectionId,
            title: title ?? `${original.title} (copy)`,
            content: original.content,
            state: "ACTIVE",
            orderIndex: original.orderIndex + 0.001,
            ...(isTimedFixedSeries(original)
                ? { dueDate: null, endDate: null }
                : { dueDate: original.dueDate, endDate: original.endDate }),
            scheduledStart: original.scheduledStart,
            scheduledEnd: original.scheduledEnd,
            zone: original.zone,
            durationEstimate: original.durationEstimate,
            timezoneLocked: original.timezoneLocked,
            priority: original.priority,
            effort: original.effort,
            linkedAppId: original.linkedAppId,
            linkedUrl: original.linkedUrl,
            isPinned: false,
            reminderAt: null,
            reminderSilenced: false,
            recurrenceRule: original.recurrenceRule,
            interactionMode: original.interactionMode,
        })
        .returning();

    const originalTags = await tx.select({ tagId: taskTags.tagId }).from(taskTags).where(eq(taskTags.taskId, id));
    if (originalTags.length > 0) {
        await tx.insert(taskTags).values(originalTags.map((tag) => ({ taskId: dup.id, tagId: tag.tagId })));
    }
    return toTask(
        dup,
        originalTags.map((tag) => tag.tagId),
    );
}

type StoredTemporal = Pick<TaskRow, "dueDate" | "endDate" | "scheduledStart" | "scheduledEnd" | "zone">;

function movedEndDate(existing: StoredTemporal, dueDate: string | null | undefined) {
    return dueDate && existing.dueDate && existing.endDate
        ? addDays(existing.endDate, daysBetween(existing.dueDate, dueDate))
        : existing.endDate;
}

function mergeTemporal(existing: StoredTemporal, body: TaskPatch): TaskTemporalFields {
    const has = (key: keyof TaskPatch) => body[key] !== undefined;
    const startsNull = body.scheduledStart === null;
    const timeEdit = has("scheduledStart") || has("scheduledEnd");
    const dueDate = has("dueDate") ? body.dueDate : existing.dueDate;
    const scheduledStart = has("scheduledStart") ? body.scheduledStart : existing.scheduledStart;
    const scheduledEnd = has("scheduledEnd") ? body.scheduledEnd : startsNull ? null : existing.scheduledEnd;
    const endDate = has("endDate")
        ? body.endDate
        : scheduledStart && has("scheduledStart")
          ? null
          : movedEndDate(existing, body.dueDate);
    return {
        dueDate,
        endDate,
        scheduledStart,
        scheduledEnd,
        zone: body.zone ?? (timeEdit ? undefined : existing.zone),
    };
}

async function patchOverStored(
    tx: Tx,
    userId: string,
    id: string,
    body: TaskPatch,
    expectedUpdatedAt: string | undefined,
    { placementChanged, temporalChanged }: { placementChanged: boolean; temporalChanged: boolean },
) {
    const [existing] = await tracing.enterSpan("tasks.update.lock", () =>
        tx
            .select({
                id: tasks.id,
                ...WHEN_COLUMNS,
                updatedAt: tasks.updatedAt,
                projectId: tasks.projectId,
                sectionId: tasks.sectionId,
            })
            .from(tasks)
            .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
            .for("update"),
    );
    throwIfNotFound(existing, "Task");
    assertNoConflict(expectedUpdatedAt, existing.updatedAt, "Task");

    const projectId = body.projectId !== undefined ? body.projectId : existing.projectId;
    const sectionId =
        body.sectionId !== undefined ? body.sectionId : projectId !== existing.projectId ? null : existing.sectionId;
    if (placementChanged) await assertOwnership(tx, userId, { projectId, sectionId });
    const zone = temporalChanged || body.recurrenceRule !== undefined ? await userZone(tx, userId) : "UTC";
    validateTaskRecurrenceRule(body.recurrenceRule, existing.zone ?? zone);

    const temporalPatch = temporalChanged ? temporalColumns(mergeTemporal(existing, body), zone) : {};
    return {
        patch: { ...body, ...(placementChanged && { sectionId }), ...temporalPatch },
        previous: { projectId: existing.projectId, sectionId: existing.sectionId },
    };
}

function sameVersionSql(expectedUpdatedAt: string): SQL {
    const expectedDate = new Date(expectedUpdatedAt);
    return Number.isNaN(expectedDate.getTime())
        ? sql`false`
        : sql`date_trunc('milliseconds', ${tasks.updatedAt}) = ${expectedDate.toISOString()}::timestamptz`;
}

export async function updateTask(tx: Tx, userId: string, id: string, body: TaskPatch, expectedUpdatedAt?: string) {
    const placementChanged = body.projectId !== undefined || body.sectionId !== undefined;
    const temporalChanged = hasTaskTemporalMutation(body);
    const needsExisting = placementChanged || temporalChanged || body.recurrenceRule !== undefined;
    const stored = needsExisting
        ? await patchOverStored(tx, userId, id, body, expectedUpdatedAt, { placementChanged, temporalChanged })
        : undefined;
    const patch: Record<string, unknown> = stored ? stored.patch : body;
    const versionCondition = !needsExisting && expectedUpdatedAt ? sameVersionSql(expectedUpdatedAt) : undefined;
    await assertStorageRoom(tx, userId, [body.content]);
    if (body.state === "COMPLETE") {
        const [stored] = await tx
            .select({ interactionMode: tasks.interactionMode })
            .from(tasks)
            .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
        if ((body.interactionMode ?? stored?.interactionMode) === "timetable") {
            throw new AppError(400, "VALIDATION_ERROR", "A Fixed block just passes; it isn't checked off");
        }
    }

    const { effortOrigin, ...columns } = patch as typeof patch & { effortOrigin?: "manual" | "accepted" };
    const provenance = {
        ...(columns.effort !== undefined ? effortProvenance(columns.effort as number | null, effortOrigin) : {}),
        ...(columns.takenBy !== undefined ? { takenAt: columns.takenBy ? sql`NOW()` : null } : {}),
        ...guessAfterWrite(columns as Parameters<typeof guessAfterWrite>[0]),
    };

    const [row] = await tracing.enterSpan("tasks.update.write", () =>
        tx
            .update(tasks)
            .set({ ...columns, ...provenance, updatedAt: sql`NOW()` })
            .where(and(eq(tasks.id, id), eq(tasks.userId, userId), versionCondition))
            .returning(),
    );
    if (!row && expectedUpdatedAt && !needsExisting) {
        const [existing] = await tracing.enterSpan("tasks.update.conflict", () =>
            tx
                .select({ updatedAt: tasks.updatedAt })
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId))),
        );
        throwIfNotFound(existing, "Task");
        throw new AppError(409, "CONFLICT", "Task was modified by another client");
    }
    throwIfNotFound(row, "Task");
    if (placementChanged && stored) await retagForMove(tx, userId, row.id, stored.previous, row);
    return row;
}

export async function moveTaskToSharedList(
    tx: Tx,
    taskId: string,
    toListId: string,
    toSectionId: string | null = null,
): Promise<boolean> {
    const [row] = await tx
        .select({ ok: sql<boolean>`r.ok` })
        .from(sql`cadence_move_task_to_list(${taskId}::uuid, ${toListId}::uuid, ${toSectionId}::uuid) AS r(ok)`);
    return Boolean(row?.ok);
}

export async function dropTaskLearningRows(tx: Tx, userId: string, taskId: string): Promise<void> {
    await tx.delete(taskMetrics).where(and(eq(taskMetrics.userId, userId), eq(taskMetrics.taskId, taskId)));
    await tx.delete(taskNlpMetadata).where(and(eq(taskNlpMetadata.userId, userId), eq(taskNlpMetadata.taskId, taskId)));
    await tx.delete(aiMemoryNotes).where(and(eq(aiMemoryNotes.userId, userId), eq(aiMemoryNotes.taskId, taskId)));
}

export async function updateTasks(
    tx: Tx,
    userId: string,
    {
        taskIds,
        patch,
        addTagIds = [],
        removeTagIds = [],
        tagOwnerId = userId,
    }: { taskIds: string[]; patch: TaskPatch; addTagIds?: string[]; removeTagIds?: string[]; tagOwnerId?: string },
) {
    if (addTagIds.length) await assertOwnership(tx, tagOwnerId, { tagIds: addTagIds });
    const rows = await Promise.all(taskIds.map((id) => updateTask(tx, userId, id, patch)));
    if (addTagIds.length) {
        await tx
            .insert(taskTags)
            .values(taskIds.flatMap((taskId) => addTagIds.map((tagId) => ({ taskId, tagId }))))
            .onConflictDoNothing();
    }
    if (removeTagIds.length) {
        await tx.delete(taskTags).where(and(inArray(taskTags.taskId, taskIds), inArray(taskTags.tagId, removeTagIds)));
    }
    return rows;
}

export async function placeTasks(tx: Tx, userId: string, items: PlaceTaskItem[]) {
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new AppError(400, "VALIDATION_ERROR", "Each task can be placed once");
    const rows = await tx
        .select({
            id: tasks.id,
            state: tasks.state,
            interactionMode: tasks.interactionMode,
            recurrenceRule: tasks.recurrenceRule,
            updatedAt: tasks.updatedAt,
            ...WHEN_COLUMNS,
        })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)))
        .for("update");
    if (rows.length !== ids.length) throwIfNotFound(undefined, "Task");
    if (
        rows.some(
            (row) =>
                row.state === "COMPLETE" ||
                row.state === "ARCHIVED" ||
                row.interactionMode === "timetable" ||
                row.recurrenceRule,
        )
    ) {
        throw new AppError(400, "VALIDATION_ERROR", "Only open, one-off tasks that aren't Fixed can be placed");
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    const changed = items.filter((item) => !sameVersion(item.expectedUpdatedAt, byId.get(item.id)!.updatedAt));
    if (changed.length) {
        throw new AppError(
            409,
            "CONFLICT",
            "Tasks were modified by another client",
            false,
            changed.map((item) => ({ code: "conflict", message: "Changed since it was read", path: item.id })),
        );
    }
    const updated = await Promise.all(
        items.map(({ id, scheduledStart, scheduledEnd, dueDate, endDate, zone }) =>
            updateTask(tx, userId, id, { scheduledStart, scheduledEnd, dueDate, endDate, zone }),
        ),
    );
    return {
        tasks: await withTagIds(tx, updated),
        previous: rows.map(({ id, scheduledStart, scheduledEnd, dueDate, endDate, zone }) => ({
            id,
            scheduledStart,
            scheduledEnd,
            dueDate,
            endDate,
            zone,
        })),
    };
}

export function justCompleted(task: { completedAt: string | null; updatedAt: string }): boolean {
    return !!task.completedAt && sameVersion(task.completedAt, task.updatedAt);
}

export async function setTaskState(
    tx: Tx,
    userId: string,
    taskIds: string[],
    state: TaskState,
    waitingOn?: string | null,
    waitingReminder?: string | null,
) {
    return tx
        .update(tasks)
        .set({
            state,
            ...(waitingOn !== undefined && { waitingOn }),
            ...(waitingReminder !== undefined && { waitingReminder }),
            updatedAt: sql`NOW()`,
        })
        .where(
            and(
                eq(tasks.userId, userId),
                inArray(tasks.id, taskIds),
                ...(state === "COMPLETE" ? [ne(tasks.interactionMode, "timetable")] : []),
            ),
        )
        .returning();
}

export async function rescheduleTasks(tx: Tx, userId: string, { taskIds, scheduledStart, date }: BatchReschedule) {
    const zone = await userZone(tx, userId);
    if (!date) {
        return tx
            .update(tasks)
            .set({ ...temporalColumns({ scheduledStart }, zone), updatedAt: sql`NOW()` })
            .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds), inArray(tasks.state, OPEN_TASK_STATES)))
            .returning();
    }
    const rows = await tx
        .select({
            id: tasks.id,
            ...WHEN_COLUMNS,
            interactionMode: tasks.interactionMode,
        })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds), inArray(tasks.state, OPEN_TASK_STATES)));
    const onlyFixed = rows.every((row) => row.interactionMode === "timetable");
    return Promise.all(
        rows
            .filter((row) => row.interactionMode !== "timetable" || onlyFixed)
            .map((row) =>
                tx
                    .update(tasks)
                    .set({ ...rescheduleToDay(row, date, zone), updatedAt: sql`NOW()` })
                    .where(and(eq(tasks.id, row.id), eq(tasks.userId, userId)))
                    .returning()
                    .then(([updated]) => updated),
            ),
    );
}

export type TaskPlacement = { to: "top" | "bottom" } | { beforeTaskId: string } | { afterTaskId: string };

function placementBounds(
    siblings: { id: string; orderIndex: number }[],
    placement: TaskPlacement,
): [number | undefined, number | undefined] {
    if ("to" in placement) {
        return placement.to === "top" ? [undefined, siblings[0]?.orderIndex] : [siblings.at(-1)?.orderIndex, undefined];
    }
    const anchorId = "beforeTaskId" in placement ? placement.beforeTaskId : placement.afterTaskId;
    const at = siblings.findIndex((row) => row.id === anchorId);
    if (at === -1)
        throw new AppError(
            400,
            "VALIDATION_ERROR",
            "The task to place next to must be another open task in the same list",
        );
    return "beforeTaskId" in placement
        ? [siblings[at - 1]?.orderIndex, siblings[at].orderIndex]
        : [siblings[at].orderIndex, siblings[at + 1]?.orderIndex];
}

export async function reorderTasks(tx: Tx, userId: string, taskIds: string[], placement: TaskPlacement) {
    const moving = await tx
        .select({ id: tasks.id, projectId: tasks.projectId })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)));
    if (moving.length !== new Set(taskIds).size) throwIfNotFound(undefined, "Task");
    const projectId = moving.find((row) => row.id === taskIds[0])!.projectId;
    const siblings = await tx
        .select({ id: tasks.id, orderIndex: tasks.orderIndex })
        .from(tasks)
        .where(
            and(
                eq(tasks.userId, userId),
                projectId ? eq(tasks.projectId, projectId) : isNull(tasks.projectId),
                inArray(tasks.state, OPEN_TASK_STATES),
                notInArray(tasks.id, taskIds),
            ),
        )
        .orderBy(asc(tasks.orderIndex));

    const [lo, hi] = placementBounds(siblings, placement);
    const n = taskIds.length;
    const indexAt = (i: number) =>
        lo !== undefined && hi !== undefined
            ? lo + ((hi - lo) * (i + 1)) / (n + 1)
            : lo !== undefined
              ? lo + ORDER_INDEX_GAP * (i + 1)
              : hi !== undefined
                ? hi - ORDER_INDEX_GAP * (n - i)
                : ORDER_INDEX_GAP * i;
    await Promise.all(
        taskIds.map((id, i) =>
            tx
                .update(tasks)
                .set({ orderIndex: indexAt(i), updatedAt: sql`NOW()` })
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId))),
        ),
    );
    return { moved: n };
}

export async function deleteTasks(tx: Tx, userId: string, taskIds: string[]) {
    return tx
        .delete(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
        .returning();
}

export async function deleteTrashedTasks(tx: Tx, userId: string) {
    const deleted = await tx
        .delete(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.state, "ARCHIVED")))
        .returning({ id: tasks.id });
    return deleted.length;
}
export { readEffortEvidence } from "./tasks.read";
