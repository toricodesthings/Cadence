/**
 * Task writes shared by the REST routes and the assistant's tools. Each takes the
 * caller's RLS transaction and returns rows; metrics run after commit through
 * `trackTaskChanges`.
 */
import { and, asc, eq, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import { tracing } from "cloudflare:workers";
import type { BatchReschedule, EffortLevel, InsertTask, Task, TaskPriority, TaskRow, TaskState, UpdateTask } from "@cadence/contracts/task";
import { hasTaskTemporalMutation, normalizeHiddenUntil, normalizeTaskTemporalFields, rescheduleToDay, type TaskTemporalFields } from "@cadence/domain/task-temporal";
import { addDays, daysBetween, type Zone } from "@cadence/domain/time";
import { validateTaskRecurrenceRule } from "@cadence/domain/task-recurrence";
import { suggestInteractionMode } from "@cadence/domain/repeats";
import { ORDER_INDEX_GAP } from "@cadence/domain/ordering";
import { subtasks, tasks, taskTags } from "../../db/schema";
import { AppError, assertNoConflict, throwIfNotFound } from "../../platform/errors";
import { insertWithClientId } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { userZone } from "../../platform/user-zone";
import { trackBatchCompletion, trackBatchEvents, trackReschedules } from "../../platform/metrics";
import type { DbClient, Tx } from "../../types/db";
import { writeNote } from "../notes/notes.service";

// ── Utility ───────────────────────────────────────────────────────────

type NewTask = Omit<typeof tasks.$inferInsert, "userId"> & { effortOrigin?: "manual" | "accepted" | null };
type TaskPatch = Omit<UpdateTask, "expectedUpdatedAt">;

/**
 * The provenance columns that go with a written `effort`: a value the person chose (or a suggestion they accepted) is
 * recorded as such; anything else (the assistant, an import, a clear) leaves it unknown, so it never counts as evidence.
 */
export function effortProvenance(effort: number | null | undefined, origin: "manual" | "accepted" | null | undefined) {
    return effort != null && origin
        ? { effortOrigin: origin, effortChosenAt: sql`NOW()` }
        : { effortOrigin: null, effortChosenAt: null };
}

/** A task as the assistant drafts it: plain fields, plus checklist steps and a note. */
export type TaskDraft = Partial<Pick<InsertTask,
    "dueDate" | "endDate" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "projectId" | "sectionId" |
    "priority" | "effort" | "recurrenceRule" | "tagIds" | "reminderAt" | "notBefore">> & {
    title: string;
    subtasks?: string[];
    /** A class or shift that just passes (Fixed). */
    fixed?: boolean;
    note?: string;
};

/** A write's temporal fields as the columns to store, in the user's zone. */
export function temporalColumns(fields: TaskTemporalFields & { notBefore?: string | null }, zone: Zone) {
    const temporal = normalizeTaskTemporalFields(fields, zone);
    return "notBefore" in fields ? { ...temporal, notBefore: normalizeHiddenUntil(fields.notBefore) } : temporal;
}

/** Metrics and usage events for committed task writes. Best-effort, never blocks the caller. */
export function trackTaskChanges(
    waitUntil: (promise: Promise<unknown>) => void,
    db: DbClient,
    userId: string,
    changes: {
        created?: string[];
        rescheduled?: { id: string; scheduledStart: string | null; dueDate: string | null }[];
        completed?: string[];
    },
) {
    const { created = [], rescheduled = [], completed = [] } = changes;
    if (rescheduled.length) {
        waitUntil(tracing.enterSpan("tasks.metrics.reschedule", () => trackReschedules(db, userId, rescheduled.map((task) => ({ taskId: task.id, scheduledStart: task.scheduledStart, dueDate: task.dueDate })))));
    }
    if (completed.length) waitUntil(tracing.enterSpan("tasks.metrics.completion", () => trackBatchCompletion(db, completed, userId)));
    const events = [
        ...created.map((taskId) => ({ event: "task.create", metadata: { taskId } })),
        ...rescheduled.map((task) => ({ event: "task.reschedule", metadata: { taskId: task.id } })),
        ...completed.map((taskId) => ({ event: "task.complete", metadata: { taskId } })),
    ];
    if (events.length) waitUntil(tracing.enterSpan("tasks.metrics.events", () => trackBatchEvents(db, userId, events)));
}

// ── API shape ─────────────────────────────────────────────────────────

/**
 * A task row as the API sends it. Writes only accept priority 0–4 and effort 1–3
 * (the contract validates them), so the columns narrow to their literal unions.
 */
export function toTask(row: TaskRow & Pick<Task, "seriesId" | "isRecurringInstance" | "occurrenceStart" | "occurrenceEnd">, tagIds: string[]): Task {
    return { ...row, priority: row.priority as TaskPriority, effort: row.effort as EffortLevel | null, tagIds };
}

/** `toTask` for rows fresh from a write: loads their tag ids in one query. */
export async function withTagIds(tx: Tx, rows: TaskRow[]): Promise<Task[]> {
    const links = rows.length
        ? await tracing.enterSpan("tasks.tags.read", () => tx
              .select({ taskId: taskTags.taskId, tagId: taskTags.tagId })
              .from(taskTags)
              .where(inArray(taskTags.taskId, rows.map((row) => row.id))))
        : [];
    return rows.map((row) => toTask(row, links.filter((link) => link.taskId === row.id).map((link) => link.tagId)));
}

// ── Create ────────────────────────────────────────────────────────────

/** Insert one task (temporal fields already normalized) and link its tags. */
export async function createTask(tx: Tx, userId: string, values: NewTask, tagIds: string[] = []) {
    validateTaskRecurrenceRule(values.recurrenceRule, values.zone ?? "UTC");
    await assertOwnership(tx, userId, { projectId: values.projectId ?? null, sectionId: values.sectionId, tagIds });

    const [row] = await insertWithClientId(() => tx
        .insert(tasks)
        .values({
            ...values,
            interactionMode: values.interactionMode ?? suggestInteractionMode(values),
            userId,
            ...effortProvenance(values.effort, values.effortOrigin),
        })
        .returning());
    if (tagIds.length > 0) {
        await tx.insert(taskTags).values(tagIds.map((tagId) => ({ taskId: row.id, tagId })));
    }
    return row;
}

/**
 * Create drafted tasks with their checklist steps and notes, all in the caller's
 * transaction: one bad reference (another user's list, say) and none are created.
 */
export async function createTasks(tx: Tx, userId: string, drafts: TaskDraft[]) {
    const created: { taskId: string; title: string; subtaskIds: string[] }[] = [];
    const zone = await userZone(tx, userId);
    for (const { subtasks: steps = [], fixed, note, tagIds = [], dueDate, endDate, scheduledStart, scheduledEnd, notBefore, ...draft } of drafts) {
        const row = await createTask(
            tx,
            userId,
            {
                ...draft,
                orderIndex: 0,
                ...temporalColumns({ dueDate, endDate, scheduledStart, scheduledEnd, ...(notBefore !== undefined && { notBefore }) }, zone),
                ...(fixed && { interactionMode: "timetable" as const }),
            },
            [...new Set(tagIds)],
        );
        const stepRows = steps.length
            ? await tx
                  .insert(subtasks)
                  .values(steps.map((title, orderIndex) => ({ taskId: row.id, userId, title, orderIndex })))
                  .returning({ id: subtasks.id })
            : [];
        if (note) await writeNote(tx, userId, row.id, note, { expectedVersion: 0 });
        created.push({ taskId: row.id, title: row.title, subtaskIds: stepRows.map((step) => step.id) });
    }
    return created;
}

/**
 * Copy a task as a new open one: same fields, tags and note text, "(copy)" on
 * the title unless one is given. Checklist steps and reminders aren't copied.
 */
export async function duplicateTask(tx: Tx, userId: string, id: string, title?: string) {
    const [original] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    throwIfNotFound(original, "Task");

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
            dueDate: original.dueDate,
            endDate: original.endDate,
            scheduledStart: original.scheduledStart,
            scheduledEnd: original.scheduledEnd,
            zone: original.zone,
            durationEstimate: original.durationEstimate,
            timezoneLocked: original.timezoneLocked,
            priority: original.priority,
            effort: original.effort,
            isPinned: false,
            reminderAt: null,
            reminderSilenced: false,
            recurrenceRule: original.recurrenceRule,
            interactionMode: original.interactionMode,
        })
        .returning();

    const originalTags = await tx
        .select({ tagId: taskTags.tagId })
        .from(taskTags)
        .where(eq(taskTags.taskId, id));
    if (originalTags.length > 0) {
        await tx.insert(taskTags).values(originalTags.map((tag) => ({ taskId: dup.id, tagId: tag.tagId })));
    }
    return toTask(dup, originalTags.map((tag) => tag.tagId));
}

// ── Update ────────────────────────────────────────────────────────────

type StoredTemporal = Pick<TaskRow, "dueDate" | "endDate" | "scheduledStart" | "scheduledEnd" | "zone">;

/**
 * A patch laid over the stored task, as the fields to validate. A time edit re-plans the task in the
 * user's zone; a day edit on a multi-day task moves its end by the same amount; turning a timed task
 * into an all-day one (or back) leaves nothing of the other shape behind.
 */
function mergeTemporal(existing: StoredTemporal, body: TaskPatch): TaskTemporalFields {
    const has = (key: keyof TaskPatch) => body[key] !== undefined;
    const startsNull = body.scheduledStart === null;
    const timeEdit = has("scheduledStart") || has("scheduledEnd");
    const dueDate = has("dueDate") ? body.dueDate : existing.dueDate;
    let endDate = has("endDate") ? body.endDate : existing.endDate;
    if (!has("endDate") && has("dueDate") && body.dueDate && existing.dueDate && existing.endDate) {
        endDate = addDays(existing.endDate, daysBetween(existing.dueDate, body.dueDate)); // keep the span
    }
    const scheduledStart = has("scheduledStart") ? body.scheduledStart : existing.scheduledStart;
    // Leaving timed behind (start cleared) forgets the old end; becoming timed forgets the old end day.
    const scheduledEnd = has("scheduledEnd") ? body.scheduledEnd : startsNull ? null : existing.scheduledEnd;
    if (scheduledStart && has("scheduledStart") && !has("endDate")) endDate = null;
    return {
        dueDate,
        endDate,
        scheduledStart,
        scheduledEnd,
        zone: body.zone ?? (timeEdit ? undefined : existing.zone),
    };
}

/** Apply a patch to one task. `expectedUpdatedAt` turns a stale edit into a 409. */
export async function updateTask(tx: Tx, userId: string, id: string, body: TaskPatch, expectedUpdatedAt?: string) {
    const placementChanged = body.projectId !== undefined || body.sectionId !== undefined;
    const temporalChanged = hasTaskTemporalMutation(body);
    const needsExisting = placementChanged || temporalChanged || body.recurrenceRule !== undefined;
    let versionCondition: SQL | undefined;
    let patch: Record<string, unknown> = body;

    // Simple edits don't depend on the stored row. UPDATE takes the row lock and
    // checks its version atomically, avoiding a separate SELECT FOR UPDATE trip.
    if (needsExisting) {
        const [existing] = await tracing.enterSpan("tasks.update.lock", () => tx
            .select({
                id: tasks.id,
                dueDate: tasks.dueDate,
                endDate: tasks.endDate,
                scheduledStart: tasks.scheduledStart,
                scheduledEnd: tasks.scheduledEnd,
                zone: tasks.zone,
                updatedAt: tasks.updatedAt,
                projectId: tasks.projectId,
                sectionId: tasks.sectionId,
            })
            .from(tasks)
            .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
            .for("update"));
        throwIfNotFound(existing, "Task");
        assertNoConflict(expectedUpdatedAt, existing.updatedAt, "Task");

        const projectId = body.projectId !== undefined ? body.projectId : existing.projectId;
        const sectionId = body.sectionId !== undefined ? body.sectionId
            : projectId !== existing.projectId ? null : existing.sectionId;
        if (placementChanged) await assertOwnership(tx, userId, { projectId, sectionId });
        const zone = temporalChanged || body.recurrenceRule !== undefined ? await userZone(tx, userId) : "UTC";
        validateTaskRecurrenceRule(body.recurrenceRule, existing.zone ?? zone);

        const temporalPatch = temporalChanged ? temporalColumns(mergeTemporal(existing, body), zone) : {};

        patch = { ...body, ...(placementChanged && { sectionId }), ...temporalPatch };
    } else if (expectedUpdatedAt) {
        // The API exposes milliseconds; Postgres stores microseconds. Match the
        // same instant comparison as assertNoConflict, including timezone offsets.
        const expectedDate = new Date(expectedUpdatedAt);
        versionCondition = Number.isNaN(expectedDate.getTime())
            ? sql`false`
            : sql`date_trunc('milliseconds', ${tasks.updatedAt}) = ${expectedDate.toISOString()}::timestamptz`;
    }

    // A changed Effort carries who chose it; the origin is never a column the caller writes directly.
    const { effortOrigin, ...columns } = patch as typeof patch & { effortOrigin?: "manual" | "accepted" };
    const provenance = columns.effort !== undefined ? effortProvenance(columns.effort as number | null, effortOrigin) : {};

    const [row] = await tracing.enterSpan("tasks.update.write", () => tx
        .update(tasks)
        .set({ ...columns, ...provenance, updatedAt: sql`NOW()` })
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId), versionCondition))
        .returning());
    if (!row && expectedUpdatedAt && !needsExisting) {
        // Only a rejected write needs this read, to distinguish 404 from 409.
        const [existing] = await tracing.enterSpan("tasks.update.conflict", () => tx
            .select({ updatedAt: tasks.updatedAt })
            .from(tasks)
            .where(and(eq(tasks.id, id), eq(tasks.userId, userId))));
        throwIfNotFound(existing, "Task");
        throw new AppError(409, "CONFLICT", "Task was modified by another client");
    }
    throwIfNotFound(row, "Task");
    return row;
}

/** The same patch and tag changes on several tasks. Any missing task fails the whole batch (404). */
export async function updateTasks(
    tx: Tx,
    userId: string,
    { taskIds, patch, addTagIds = [], removeTagIds = [] }: { taskIds: string[]; patch: TaskPatch; addTagIds?: string[]; removeTagIds?: string[] },
) {
    await assertOwnership(tx, userId, { tagIds: addTagIds });
    // Issued together: postgres.js pipelines them on the transaction's connection, so the
    // batch costs a couple of round trips instead of two per task.
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

/** Move tasks to a state (Done, Trash, back to open, Waiting, with its check-in). Unknown ids are skipped. */
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
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
        .returning();
}

/**
 * Move tasks: to one exact `scheduledStart`, or to a local `date` where each keeps its own
 * time (all-day stays all-day), in the user's zone. Fixed blocks stay put unless they're all
 * that was asked to move.
 */
export async function rescheduleTasks(tx: Tx, userId: string, { taskIds, scheduledStart, date }: BatchReschedule) {
    const zone = await userZone(tx, userId);
    if (!date) {
        return tx
            .update(tasks)
            .set({ ...temporalColumns({ scheduledStart }, zone), updatedAt: sql`NOW()` })
            .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
            .returning();
    }
    const rows = await tx
        .select({
            id: tasks.id,
            dueDate: tasks.dueDate,
            endDate: tasks.endDate,
            scheduledStart: tasks.scheduledStart,
            scheduledEnd: tasks.scheduledEnd,
            zone: tasks.zone,
            interactionMode: tasks.interactionMode,
        })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)));
    const onlyFixed = rows.every((row) => row.interactionMode === "timetable");
    // Each task gets its own values; the updates are pipelined like `updateTasks`.
    return Promise.all(
        rows
            .filter((row) => row.interactionMode !== "timetable" || onlyFixed)
            .map((row) =>
                tx
                    .update(tasks)
                    .set({ ...rescheduleToDay(row, date, zone), updatedAt: sql`NOW()` })
                    .where(and(eq(tasks.id, row.id), eq(tasks.userId, userId)))
                    .returning()
                    .then(([updated]) => updated)),
    );
}

/** Where `reorderTasks` puts its tasks: the top or bottom of their list, or next to another task. */
export type TaskPlacement = { to: "top" | "bottom" } | { beforeTaskId: string } | { afterTaskId: string };

/**
 * Place tasks one after another, in the order given, within the manual order of
 * the first task's list (no list = the unlisted tasks). Only the moved tasks
 * change; they land between their new neighbours' order indexes.
 */
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
        .where(and(
            eq(tasks.userId, userId),
            projectId ? eq(tasks.projectId, projectId) : isNull(tasks.projectId),
            inArray(tasks.state, ["ACTIVE", "WAITING"]),
            notInArray(tasks.id, taskIds),
        ))
        .orderBy(asc(tasks.orderIndex));

    let lo: number | undefined;
    let hi: number | undefined;
    if ("to" in placement) {
        if (placement.to === "top") hi = siblings[0]?.orderIndex;
        else lo = siblings.at(-1)?.orderIndex;
    } else {
        const anchorId = "beforeTaskId" in placement ? placement.beforeTaskId : placement.afterTaskId;
        const at = siblings.findIndex((row) => row.id === anchorId);
        if (at === -1) throw new AppError(400, "VALIDATION_ERROR", "The task to place next to must be another open task in the same list");
        if ("beforeTaskId" in placement) [lo, hi] = [siblings[at - 1]?.orderIndex, siblings[at].orderIndex];
        else [lo, hi] = [siblings[at].orderIndex, siblings[at + 1]?.orderIndex];
    }
    const n = taskIds.length;
    const indexAt = (i: number) =>
        lo !== undefined && hi !== undefined ? lo + ((hi - lo) * (i + 1)) / (n + 1)
            : lo !== undefined ? lo + ORDER_INDEX_GAP * (i + 1)
                : hi !== undefined ? hi - ORDER_INDEX_GAP * (n - i)
                    : ORDER_INDEX_GAP * i;
    // ponytail: halving the gap on every insert-between loses precision after ~50 moves
    // into one spot; the REST reorder's full rebalance (orderedTaskIds) resets it.
    await Promise.all(taskIds.map((id, i) =>
        tx.update(tasks).set({ orderIndex: indexAt(i), updatedAt: sql`NOW()` }).where(and(eq(tasks.id, id), eq(tasks.userId, userId)))));
    return { moved: n };
}

// ── Delete ────────────────────────────────────────────────────────────

/** Permanently delete tasks (not Trash). Returns the deleted rows; unknown ids are skipped. */
export async function deleteTasks(tx: Tx, userId: string, taskIds: string[]) {
    return tx
        .delete(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
        .returning();
}

/** Empty Trash: permanently delete every trashed task. Returns how many went. */
export async function deleteTrashedTasks(tx: Tx, userId: string) {
    const deleted = await tx
        .delete(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.state, "ARCHIVED")))
        .returning({ id: tasks.id });
    return deleted.length;
}
