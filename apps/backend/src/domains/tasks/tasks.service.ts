/**
 * Task writes shared by the REST routes and the assistant's tools. Each takes the
 * caller's RLS transaction and returns rows; metrics run after commit through
 * `trackTaskChanges`.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchReschedule, InsertTask, TaskState, UpdateTask } from "@cadence/contracts/task";
import { hasTaskTemporalMutation, inferIsAllDay, normalizeTaskTemporalFields } from "@cadence/domain/task-temporal";
import { validateTaskRecurrenceRule } from "@cadence/domain/task-recurrence";
import { suggestInteractionMode } from "@cadence/domain/repeats";
import { subtasks, tasks, taskTags } from "../../db/schema";
import { assertNoConflict, throwIfNotFound } from "../../platform/errors";
import { assertOwnership } from "../../platform/ownership";
import { atLocalDate } from "../../platform/date-utils";
import { trackBatchCompletion, trackBatchEvents, trackReschedule } from "../../platform/metrics";
import type { DbClient, Tx } from "../../types/db";
import { writeNote } from "../notes/notes.service";

// ── Utility ───────────────────────────────────────────────────────────

type NewTask = Omit<typeof tasks.$inferInsert, "userId">;
type TaskPatch = Omit<UpdateTask, "expectedUpdatedAt">;

/** A task as the assistant drafts it: plain fields, plus checklist steps and a note. */
export type TaskDraft = Partial<Pick<InsertTask,
    "dueDate" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "projectId" | "sectionId" |
    "priority" | "effort" | "recurrenceRule" | "tagIds">> & {
    title: string;
    subtasks?: string[];
    /** A class or shift that just passes (Fixed). */
    fixed?: boolean;
    note?: string;
};

/**
 * One task moved to a local `date`, keeping its shape: an all-day task lands on
 * the date, a timed task keeps its local time there, and an end (or deadline)
 * moves by the same amount.
 */
export function rescheduleToDate(
    row: { isAllDay: boolean; dueDate: string | null; scheduledStart: string | null; scheduledEnd: string | null },
    date: string,
    timezone: string,
) {
    const shift = (value: string | null, ms: number) => (value ? new Date(new Date(value).getTime() + ms).toISOString() : null);
    if (!row.isAllDay && row.scheduledStart) {
        const start = atLocalDate(new Date(row.scheduledStart), date, timezone);
        const delta = start.getTime() - new Date(row.scheduledStart).getTime();
        return normalizeTaskTemporalFields({
            isAllDay: false,
            scheduledStart: start.toISOString(),
            scheduledEnd: shift(row.scheduledEnd, delta),
            dueDate: shift(row.dueDate, delta),
        });
    }
    const anchor = (row.dueDate ?? row.scheduledStart)?.slice(0, 10);
    const days = anchor ? Date.parse(date) - Date.parse(anchor) : 0;
    return normalizeTaskTemporalFields({ isAllDay: true, dueDate: date, scheduledEnd: shift(row.scheduledEnd, days) });
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
    for (const task of rescheduled) waitUntil(trackReschedule(db, task.id, userId, task.scheduledStart ?? task.dueDate));
    if (completed.length) waitUntil(trackBatchCompletion(db, completed, userId));
    const events = [
        ...created.map((taskId) => ({ event: "task.create", metadata: { taskId } })),
        ...rescheduled.map((task) => ({ event: "task.reschedule", metadata: { taskId: task.id } })),
        ...completed.map((taskId) => ({ event: "task.complete", metadata: { taskId } })),
    ];
    if (events.length) waitUntil(trackBatchEvents(db, userId, events));
}

// ── Create ────────────────────────────────────────────────────────────

/** Insert one task (temporal fields already normalized) and link its tags. */
export async function createTask(tx: Tx, userId: string, values: NewTask, tagIds: string[] = []) {
    validateTaskRecurrenceRule(values.recurrenceRule, values.scheduledStart ?? null);
    await assertOwnership(tx, userId, { projectId: values.projectId ?? null, sectionId: values.sectionId, tagIds });

    const [row] = await tx
        .insert(tasks)
        .values({ ...values, interactionMode: values.interactionMode ?? suggestInteractionMode(values), userId })
        .returning();
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
    for (const { subtasks: steps = [], fixed, note, tagIds = [], dueDate, scheduledStart, scheduledEnd, ...draft } of drafts) {
        const row = await createTask(
            tx,
            userId,
            {
                ...draft,
                orderIndex: 0,
                ...normalizeTaskTemporalFields({ dueDate, scheduledStart, scheduledEnd, isAllDay: inferIsAllDay({ dueDate, scheduledStart }) }),
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

// ── Update ────────────────────────────────────────────────────────────

/** Apply a patch to one task. `expectedUpdatedAt` turns a stale edit into a 409. */
export async function updateTask(tx: Tx, userId: string, id: string, body: TaskPatch, expectedUpdatedAt?: string) {
    const [existing] = await tx
        .select({
            id: tasks.id,
            isAllDay: tasks.isAllDay,
            dueDate: tasks.dueDate,
            scheduledStart: tasks.scheduledStart,
            scheduledEnd: tasks.scheduledEnd,
            updatedAt: tasks.updatedAt,
            projectId: tasks.projectId,
            sectionId: tasks.sectionId,
        })
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        .for("update");
    throwIfNotFound(existing, "Task");
    assertNoConflict(expectedUpdatedAt, existing.updatedAt, "Task");

    const projectId = body.projectId !== undefined ? body.projectId : existing.projectId;
    const sectionId = body.sectionId !== undefined ? body.sectionId
        : projectId !== existing.projectId ? null : existing.sectionId;
    const placementChanged = body.projectId !== undefined || body.sectionId !== undefined;
    if (placementChanged) await assertOwnership(tx, userId, { projectId, sectionId });
    validateTaskRecurrenceRule(body.recurrenceRule, body.scheduledStart ?? existing.scheduledStart);

    const temporalPatch = hasTaskTemporalMutation(body)
        ? normalizeTaskTemporalFields({
              isAllDay: body.isAllDay ?? existing.isAllDay,
              dueDate: "dueDate" in body ? body.dueDate : existing.dueDate,
              scheduledStart: "scheduledStart" in body ? body.scheduledStart : existing.scheduledStart,
              scheduledEnd: "scheduledEnd" in body ? body.scheduledEnd : existing.scheduledEnd,
          })
        : {};

    const [row] = await tx
        .update(tasks)
        .set({ ...body, ...(placementChanged && { sectionId }), ...temporalPatch, updatedAt: sql`NOW()` })
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        .returning();
    return row;
}

/** The same patch and tag changes on several tasks. Any missing task fails the whole batch (404). */
export async function updateTasks(
    tx: Tx,
    userId: string,
    { taskIds, patch, addTagIds = [], removeTagIds = [] }: { taskIds: string[]; patch: TaskPatch; addTagIds?: string[]; removeTagIds?: string[] },
) {
    await assertOwnership(tx, userId, { tagIds: addTagIds });
    const rows = [];
    for (const id of taskIds) rows.push(await updateTask(tx, userId, id, patch));
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

/** Move tasks to a state (Done, Trash, back to open, Waiting). Unknown ids are skipped. */
export async function setTaskState(tx: Tx, userId: string, taskIds: string[], state: TaskState, waitingOn?: string | null) {
    return tx
        .update(tasks)
        .set({ state, ...(waitingOn !== undefined && { waitingOn }), updatedAt: sql`NOW()` })
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
        .returning();
}

/**
 * Move tasks: to one exact `scheduledStart`, or to a local `date` where each keeps
 * its own time. Fixed blocks stay put unless they're all that was asked to move.
 */
export async function rescheduleTasks(tx: Tx, userId: string, { taskIds, scheduledStart, isAllDay, date, timezone }: BatchReschedule) {
    if (!date) {
        return tx
            .update(tasks)
            .set({ ...normalizeTaskTemporalFields({ isAllDay, scheduledStart }), updatedAt: sql`NOW()` })
            .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
            .returning();
    }
    const rows = await tx
        .select({
            id: tasks.id,
            isAllDay: tasks.isAllDay,
            dueDate: tasks.dueDate,
            scheduledStart: tasks.scheduledStart,
            scheduledEnd: tasks.scheduledEnd,
            interactionMode: tasks.interactionMode,
        })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)));
    const onlyFixed = rows.every((row) => row.interactionMode === "timetable");
    const moved = [];
    for (const row of rows) {
        if (row.interactionMode === "timetable" && !onlyFixed) continue;
        const [updated] = await tx
            .update(tasks)
            .set({ ...rescheduleToDate(row, date, timezone!), updatedAt: sql`NOW()` })
            .where(and(eq(tasks.id, row.id), eq(tasks.userId, userId)))
            .returning();
        moved.push(updated);
    }
    return moved;
}

// ── Delete ────────────────────────────────────────────────────────────

/** Permanently delete tasks (not Trash). Returns the deleted rows; unknown ids are skipped. */
export async function deleteTasks(tx: Tx, userId: string, taskIds: string[]) {
    return tx
        .delete(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
        .returning();
}
