import { Hono } from "hono";
import { assertTaskOwnership } from "../../platform/ownership";
import {
    assertListRoom,
    listAccess,
    noteAudience,
    noteChange,
    requireEdit,
    requireOwner,
    taskAccess,
    tasksByOwner,
    type ListAccess,
} from "../../platform/list-access";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parseCanonicalNlpEnvelope, type CanonicalNlpEnvelope } from "@cadence/nlp";
import { tasks, tags, taskTags, taskNlpMetadata } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { checkIdempotency, getIdempotencyKey, recordMutation, storedResult } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { withCallerRls } from "../../platform/caller-rls";
import { readEffortEvidence, readTaskBatch, readTasks } from "./tasks.read";
import { hasTaskTemporalMutation } from "@cadence/domain/task-temporal";
import { computeGappedOrderIndex } from "@cadence/domain/ordering";
import { apiValidator } from "../../platform/validation";
import type { AuthVariables } from "../../platform/auth";
import { uuidParamSchema } from "@cadence/contracts/common";
import { taskTagSchema } from "@cadence/contracts/tag";
import {
    sourceSurfaceSchema,
    batchDeleteSchema,
    batchRescheduleSchema,
    batchStateSchema,
    insertTaskSchema,
    placeTasksSchema,
    reorderTaskSchema,
    taskListQuerySchema,
    taskBatchQuerySchema,
    updateTaskSchema,
} from "@cadence/contracts/task";
import type { Tx } from "../../types/db";
import type { Env } from "../../types/env";
import { loadNlpRuntime, inferTaskFieldsFromParse, persistNlpSnapshot } from "./task-nlp";
import { recordSlot } from "../ai/memory/planning.service";
import { suggestEffortGuess } from "../decisions/effort-guess";
import {
    createTask,
    deleteTasks,
    deleteTrashedTasks,
    duplicateTask,
    justCompleted,
    placeTasks,
    rescheduleTasks,
    setTaskState,
    slotsOf,
    temporalColumns,
    toTask,
    trackTaskChanges,
    updateTask,
    withTagIds,
    type TaskSlot,
} from "./tasks.service";
import { userZone } from "../../platform/user-zone";
import type { Context } from "hono";
import type { Zone } from "@cadence/domain/time";
import type { Task, TaskRow } from "@cadence/contracts/task";

const taskTagParamSchema = z.object({
    id: z.uuid(),
    tagId: z.uuid(),
});

const nlpInputFields = {
    rawInput: z.string().max(2000),
    sourceSurface: sourceSurfaceSchema.optional(),
    dateStyle: z.enum(["mdy", "dmy", "ymd"]).optional(),
    dismissedEntityIds: z.array(z.string().min(1).max(100)).optional(),
    userOverrides: z.record(z.string(), z.unknown()).optional(),
};

const nlpReparseSchema = z.object({
    ...nlpInputFields,
    nlp: z.object(nlpInputFields).optional(),
    parseResult: z.record(z.string(), z.unknown()).optional(),
    cleanedTitle: z.string().max(500).optional(),
    confidenceTier: z.enum(["high", "medium", "low"]).optional(),
    parserVersion: z.string().max(20).optional(),
});

/** The task an earlier attempt of this same request already made, if any. */
async function replayedTask(tx: Tx, userId: string, idempotencyKey: string | undefined, ownerId = userId) {
    const existingId = await checkIdempotency(tx, userId, idempotencyKey);
    if (!existingId) return undefined;
    const [existing] = await withTagIds(
        tx,
        await tx
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, existingId), eq(tasks.userId, ownerId))),
    );
    return existing;
}

type RouteContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

/** Who a write acts as: the list's owner (the rows stay theirs). Anyone else may only edit within the list. */
function actingAs(access: ListAccess | null, userId: string) {
    requireEdit(access);
    const ownerId = access?.ownerId ?? userId;
    return { ownerId, guest: ownerId !== userId };
}

/** Tags and reminders on a shared task belong to its owner. */
function requireOwnerFields(
    guest: boolean,
    body: { tagIds?: unknown[]; reminderAt?: unknown; reminderSilenced?: unknown },
) {
    if (guest && (body.tagIds?.length || body.reminderAt != null || body.reminderSilenced === true))
        throw new AppError(403, "OWNER_ONLY", "Only the owner of this list can set tags or reminders on its tasks.");
}

/** Tell everyone who can read the list, and push the rows this write returned. */
function announce(c: RouteContext, accesses: (ListAccess | null)[], rows: Task[]) {
    noteAudience(c, ...accesses);
    for (const task of rows) noteChange(c, { type: "task", task });
}

type Group = { access: ListAccess | null; ids: string[]; ownerId: string; guest: boolean };

/**
 * Write batches of task ids once per list they sit in, as that list's owner, then announce the rows. Unknown ids, and
 * other people's tasks outside shared lists, are skipped as they always were. `own` is what the caller owns: the
 * only rows their learning may see.
 */
async function batchWrite(c: RouteContext, taskIds: string[], write: (tx: Tx, group: Group) => Promise<TaskRow[]>) {
    const userId = c.get("userId");
    const done = await withRls(getDbClient(c.env), userId, async (tx) => {
        const groups = await tasksByOwner(tx, userId, taskIds, { skipMissing: true });
        const rows: Task[] = [];
        const own: Task[] = [];
        for (const { access, ids } of groups) {
            const acting = actingAs(access, userId);
            const written = await withTagIds(tx, await write(tx, { access, ids, ...acting }));
            rows.push(...written);
            if (!acting.guest) own.push(...written);
        }
        return { rows, own, accesses: groups.map((group) => group.access) };
    });
    announce(c, done.accesses, done.rows);
    return done;
}

type CreateTaskBody = Omit<z.infer<typeof insertTaskSchema>, "tagIds" | "nlp">;

/** The new task's words, parsed with the person's lists, tags and clock. */
async function parseCreateNlp(tx: Tx, userId: string, nlp: NonNullable<z.infer<typeof insertTaskSchema>["nlp"]>) {
    const runtime = await loadNlpRuntime(tx, userId);
    const parsed = parseCanonicalNlpEnvelope(
        {
            ...nlp,
            dismissedEntityIds: [...(nlp.dismissedEntityIds ?? []), ...Array.from(runtime.dismissedEntityIds)],
        },
        { context: runtime.context, clock: runtime.clock },
    );
    return { runtime, parsed };
}

/** The sent fields with what the words added (`inferTaskFieldsFromParse` already let explicit ones win). */
function withInferred(body: CreateTaskBody, inferred: ReturnType<typeof inferTaskFieldsFromParse>, zone: Zone) {
    return {
        ...body,
        projectId: inferred.projectId !== undefined ? inferred.projectId : body.projectId,
        priority: inferred.priority ?? body.priority,
        durationEstimate: inferred.durationEstimate ?? body.durationEstimate,
        waitingOn: inferred.waitingOn ?? body.waitingOn,
        recurrenceRule: inferred.recurrenceRule ?? body.recurrenceRule,
        ...temporalColumns(
            {
                dueDate: inferred.dueDate ?? body.dueDate ?? null,
                endDate: body.endDate,
                scheduledStart: inferred.scheduledStart ?? body.scheduledStart ?? null,
                scheduledEnd: inferred.scheduledEnd ?? body.scheduledEnd ?? null,
                zone: body.zone,
                notBefore: body.notBefore,
            },
            zone,
        ),
    };
}

export const taskRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/:id/duplicate", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");
        const idempotencyKey = getIdempotencyKey(c);

        const { duplicate, access } = await withCallerRls(c, async (tx, userId) => {
            const [{ access }] = await tasksByOwner(tx, userId, [id]);
            const { ownerId, guest } = actingAs(access, userId);
            const replayed = await replayedTask(tx, userId, idempotencyKey, ownerId);
            if (replayed) return { duplicate: replayed, access };

            if (guest) await assertListRoom(tx, access!.listId);
            const dup = await duplicateTask(tx, ownerId, id);
            await recordMutation(tx, userId, idempotencyKey, dup.id);
            return { duplicate: dup, access };
        });

        announce(c, [access], [duplicate]);
        return c.json({ data: duplicate }, 201);
    })
    .post("/:id/reparse", apiValidator("param", uuidParamSchema), apiValidator("json", nlpReparseSchema), async (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);

        const metadata = await withCallerRls(c, async (tx, userId) => {
            // Idempotency guard: return existing NLP metadata if already processed
            const dedupId = await checkIdempotency(tx, userId, idempotencyKey);
            if (dedupId) {
                const [existing] = await tx
                    .select()
                    .from(taskNlpMetadata)
                    .where(and(eq(taskNlpMetadata.taskId, id), eq(taskNlpMetadata.userId, userId)));
                if (existing) return existing;
            }

            requireOwner(await taskAccess(tx, userId, id));
            await assertTaskOwnership(tx, userId, id);

            const nlpRuntime = await loadNlpRuntime(tx, userId);
            const fallbackEnvelope = {
                rawInput: body.rawInput,
                sourceSurface: (body.sourceSurface ?? "quick_add") as CanonicalNlpEnvelope["sourceSurface"],
                dateStyle: (body.dateStyle ??
                    nlpRuntime.settings.dateTime?.dateStyle ??
                    "mdy") as CanonicalNlpEnvelope["dateStyle"],
                dismissedEntityIds: body.dismissedEntityIds ?? Array.from(nlpRuntime.dismissedEntityIds),
                userOverrides: body.userOverrides ?? {},
            } satisfies CanonicalNlpEnvelope;
            const envelope: CanonicalNlpEnvelope = body.nlp
                ? {
                      ...fallbackEnvelope,
                      ...body.nlp,
                      sourceSurface: body.nlp.sourceSurface ?? fallbackEnvelope.sourceSurface,
                      dateStyle: body.nlp.dateStyle ?? fallbackEnvelope.dateStyle,
                      dismissedEntityIds: body.nlp.dismissedEntityIds ?? fallbackEnvelope.dismissedEntityIds,
                      userOverrides: body.nlp.userOverrides ?? fallbackEnvelope.userOverrides,
                  }
                : fallbackEnvelope;
            const parsed = parseCanonicalNlpEnvelope(envelope, {
                context: nlpRuntime.context,
                clock: nlpRuntime.clock,
            });

            const values = {
                rawInput: parsed.rawInput,
                sourceSurface: parsed.sourceSurface,
                parseResult: parsed as unknown as Record<string, unknown>,
                cleanedTitle: parsed.cleanedTitle,
                confidenceTier: parsed.overallConfidence ?? "medium",
                parserVersion: parsed.parserVersion,
                isCurrent: true,
            } as const;
            const [row] = await (async () => {
                const existing = await tx
                    .select()
                    .from(taskNlpMetadata)
                    .where(and(eq(taskNlpMetadata.taskId, id), eq(taskNlpMetadata.userId, userId)))
                    .limit(1);

                if (existing[0]) {
                    const [updated] = await tx
                        .update(taskNlpMetadata)
                        .set(values)
                        .where(and(eq(taskNlpMetadata.taskId, id), eq(taskNlpMetadata.userId, userId)))
                        .returning();
                    return [updated];
                }

                return tx
                    .insert(taskNlpMetadata)
                    .values({ taskId: id, userId, ...values })
                    .returning();
            })();
            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: metadata }, 201);
    })
    .post("/", apiValidator("json", insertTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { tagIds, nlp, ...body } = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const { task, access, guest } = await withRls(db, userId, async (tx) => {
            let access = body.projectId ? await listAccess(tx, userId, body.projectId) : null;
            const { ownerId, guest } = actingAs(access, userId);
            requireOwnerFields(guest, { tagIds, ...body });
            // Idempotency: return existing result if this mutation was already processed
            const replayed = await replayedTask(tx, userId, idempotencyKey, ownerId);
            if (replayed) return { task: replayed, access, guest };
            if (guest) await assertListRoom(tx, access!.listId);

            const fromWords = nlp ? await parseCreateNlp(tx, userId, nlp) : null;
            const parsed = fromWords?.parsed ?? null;

            const zone = await userZone(tx, userId);
            // `resolved`: the client sent the user's final fields; they are stored as sent and never re-inferred.
            const inferredFromWords =
                fromWords && !nlp?.resolved
                    ? inferTaskFieldsFromParse(
                          fromWords.parsed,
                          {
                              projectId: body.projectId,
                              tagIds: tagIds,
                              priority: body.priority,
                              durationEstimate: body.durationEstimate,
                              waitingOn: body.waitingOn,
                              recurrenceRule: body.recurrenceRule,
                              dueDate: body.dueDate,
                              scheduledStart: body.scheduledStart,
                              scheduledEnd: body.scheduledEnd,
                          },
                          zone,
                      )
                    : null;
            // The words name the caller's own lists and tags: in someone else's list they place nothing.
            const inferred =
                inferredFromWords && guest
                    ? { ...inferredFromWords, projectId: undefined, tagIds: [] }
                    : inferredFromWords;

            const allTagIds = Array.from(new Set([...(tagIds ?? []), ...(inferred?.tagIds ?? [])]));
            const taskBody = inferred
                ? withInferred(body, inferred, zone)
                : {
                      ...body,
                      ...temporalColumns(body, zone),
                  };

            // A list named in the words is the caller's own, but it may be one they share.
            if (taskBody.projectId && taskBody.projectId !== body.projectId)
                access = await listAccess(tx, userId, taskBody.projectId);
            const { row, tagIds: storedTagIds } = await createTask(tx, ownerId, taskBody, allTagIds);

            // Someone else's actions never train the owner's models (and the row isn't the caller's own).
            if (parsed && !guest) {
                await persistNlpSnapshot(tx, parsed, row.id, userId);
            }

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return { task: toTask(row, storedTagIds), access, guest };
        });

        announce(c, [access], [task]);
        if (!guest) {
            trackTaskChanges((p) => c.executionCtx.waitUntil(p), db, userId, { created: [task.id] });
            c.executionCtx.waitUntil(suggestEffortGuess(c.env, userId, task.id));
        }

        return c.json({ data: task }, 201);
    })
    .post("/:id/tags", apiValidator("param", uuidParamSchema), apiValidator("json", taskTagSchema), async (c) => {
        const { id } = c.req.valid("param");
        const { tagId } = c.req.valid("json");

        const association = await withCallerRls(c, async (tx, userId) => {
            requireOwner(await taskAccess(tx, userId, id));
            await assertTaskOwnership(tx, userId, id);

            const [tag] = await tx
                .select({ id: tags.id })
                .from(tags)
                .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));

            throwIfNotFound(tag, "Tag");

            // Idempotent: re-attaching an attached tag (e.g. an offline replay) returns the
            // existing association instead of tripping the unique (task, tag) index.
            const [assoc] = await tx.insert(taskTags).values({ taskId: id, tagId }).onConflictDoNothing().returning();
            if (assoc) return assoc;
            const [existing] = await tx
                .select()
                .from(taskTags)
                .where(and(eq(taskTags.taskId, id), eq(taskTags.tagId, tagId)));
            return existing;
        });

        return c.json({ data: association }, 201);
    })
    .post("/batch/reschedule", apiValidator("json", batchRescheduleSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const from = new Map<string, TaskSlot>();
        const { rows: updatedTasks, own } = await batchWrite(c, body.taskIds, async (tx, { ids, ownerId }) => {
            for (const [id, slot] of await slotsOf(tx, ownerId, ids)) from.set(id, slot);
            return rescheduleTasks(tx, ownerId, { ...body, taskIds: ids });
        });
        trackTaskChanges((p) => c.executionCtx.waitUntil(p), db, userId, { rescheduled: own, from }, { env: c.env });

        return c.json({ data: updatedTasks });
    })
    // Fit today: one transaction for the whole day, and its Undo. Never a slot record or a reschedule signal (E12).
    .post("/place", apiValidator("json", placeTasksSchema), async (c) => {
        const userId = c.get("userId");
        const { items } = c.req.valid("json");
        const key = getIdempotencyKey(c);
        const result = await withRls(getDbClient(c.env), userId, async (tx) => {
            if (await checkIdempotency(tx, userId, key)) {
                const replay = await storedResult(tx, userId, key!);
                if (replay)
                    return replay as Awaited<ReturnType<typeof placeTasks>> & { accesses?: (ListAccess | null)[] };
            }
            const groups = await tasksByOwner(
                tx,
                userId,
                items.map((item) => item.id),
            );
            const placed = { tasks: [] as Task[], previous: [] as Awaited<ReturnType<typeof placeTasks>>["previous"] };
            for (const { access, ids } of groups) {
                const { ownerId } = actingAs(access, userId);
                const part = await placeTasks(
                    tx,
                    ownerId,
                    items.filter((item) => ids.includes(item.id)),
                );
                placed.tasks.push(...part.tasks);
                placed.previous.push(...part.previous);
            }
            await recordMutation(tx, userId, key, items[0].id, placed);
            return { ...placed, accesses: groups.map((group) => group.access) };
        });
        announce(c, result.accesses ?? [], result.tasks);
        return c.json({ data: { tasks: result.tasks, previous: result.previous } });
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { expectedUpdatedAt, findTime, ...body } = c.req.valid("json");
        const db = getDbClient(c.env);

        const moving = hasTaskTemporalMutation(body);
        let from = new Map<string, TaskSlot>();
        const {
            task: updated,
            access,
            guest,
        } = await withRls(db, userId, async (tx) => {
            const [{ access }] = await tasksByOwner(tx, userId, [id]);
            const { ownerId, guest } = actingAs(access, userId);
            if (guest) {
                requireOwnerFields(guest, {
                    reminderAt: body.reminderAt,
                    reminderSilenced: body.reminderSilenced === undefined ? false : true,
                });
                if (body.projectId !== undefined && body.projectId !== access!.listId)
                    throw new AppError(
                        403,
                        "OWNER_ONLY",
                        "Only the owner of this list can move its tasks to another list.",
                    );
            }
            if (moving || findTime) from = await slotsOf(tx, ownerId, [id]);
            const [task] = await withTagIds(tx, [await updateTask(tx, ownerId, id, body, expectedUpdatedAt)]);
            return { task, access, guest };
        });
        announce(c, [access], [updated]);
        if (guest) return c.json({ data: updated });
        trackTaskChanges(
            (p) => c.executionCtx.waitUntil(p),
            db,
            userId,
            {
                rescheduled: moving ? [updated] : [],
                completed: justCompleted(updated) ? [id] : [],
                from,
            },
            { env: c.env },
        );
        if (body.title !== undefined || body.projectId !== undefined)
            c.executionCtx.waitUntil(suggestEffortGuess(c.env, userId, id));
        // A choice about when to start something: the person's own (a drop, the time field) or a Cadence proposal they
        // picked or undid. Best-effort and silent; it never changes the response.
        if (moving || findTime) {
            c.executionCtx.waitUntil(
                recordSlot(c.env, userId, {
                    taskId: id,
                    before: { scheduledStart: from.get(id)?.scheduledStart ?? null },
                    after: {
                        scheduledStart: updated.scheduledStart,
                        scheduledEnd: updated.scheduledEnd,
                        projectId: updated.projectId,
                        durationEstimate: updated.durationEstimate,
                        recurrenceRule: updated.recurrenceRule,
                    },
                    findTime,
                    queuedAt: c.req.header("X-Queued-At"),
                }),
            );
        }

        return c.json({ data: updated });
    })
    .patch(
        "/:id/reorder",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", reorderTaskSchema),
        async (c) => {
            const { id } = c.req.valid("param");
            const { orderIndex, orderedTaskIds } = c.req.valid("json");

            const { updated, access } = await withCallerRls(c, async (tx, callerId) => {
                const [{ access }] = await tasksByOwner(tx, callerId, [id]);
                const { ownerId: userId } = actingAs(access, callerId);
                // If the client sent the full ordered list, rebalance all affected tasks
                if (orderedTaskIds && orderedTaskIds.length > 1) {
                    // Batch all reorder updates into a single UPDATE with CASE. The cast is
                    // required: drivers send JS numbers untyped, and a CASE whose branches are
                    // all untyped resolves to text, which Postgres won't assign to a double.
                    const caseChunks = orderedTaskIds.map(
                        (taskId, idx) => sql`WHEN ${taskId} THEN ${computeGappedOrderIndex(idx)}::double precision`,
                    );
                    await tx.execute(sql`
                    UPDATE tasks
                    SET order_index = CASE id ${sql.join(caseChunks, sql` `)} END,
                        updated_at = NOW()
                    WHERE id IN ${sql`(${sql.join(
                        orderedTaskIds.map((id) => sql`${id}`),
                        sql`, `,
                    )})`}
                      AND user_id = ${userId}
                `);

                    const rows = await tx
                        .select()
                        .from(tasks)
                        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
                    return { updated: (await withTagIds(tx, rows))[0], access };
                }

                // Fallback: only update the single moved task
                const rows = await tx
                    .update(tasks)
                    .set({ orderIndex, updatedAt: sql`NOW()` })
                    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                    .returning();
                return { updated: (await withTagIds(tx, rows))[0], access };
            });

            throwIfNotFound(updated, "Task");
            // Siblings moved too, which the one row can't show: the list refetches.
            noteAudience(c, access);
            if (updated.projectId) noteChange(c, { type: "list", listId: updated.projectId });
            return c.json({ data: updated });
        },
    )
    .patch("/batch/state", apiValidator("json", batchStateSchema), async (c) => {
        const userId = c.get("userId");
        const { taskIds, state } = c.req.valid("json");
        const db = getDbClient(c.env);

        const { rows: updatedTasks, own } = await batchWrite(c, taskIds, (tx, { ids, ownerId }) =>
            setTaskState(tx, ownerId, ids, state),
        );
        trackTaskChanges(
            (p) => c.executionCtx.waitUntil(p),
            db,
            userId,
            {
                completed: own.filter(justCompleted).map((task) => task.id),
            },
            { env: c.env },
        );

        return c.json({ data: updatedTasks });
    })
    .get("/", apiValidator("query", taskListQuerySchema), async (c) => {
        const query = c.req.valid("query");

        const items = await withCallerRls(c, (tx, userId) => readTasks(tx, userId, query, { shared: true }));

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: items });
    })
    .get("/batch", apiValidator("query", taskBatchQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { queries } = c.req.valid("query");
        const items = await withRls(getDbClient(c.env), userId, (tx) =>
            readTaskBatch(tx, userId, queries, { shared: true }),
        );
        c.header("Cache-Control", "private, no-store");
        return c.json({ data: items });
    })
    .get("/effort-evidence", async (c) => {
        const userId = c.get("userId");
        const items = await withRls(getDbClient(c.env), userId, (tx) => readEffortEvidence(tx, userId));
        c.header("Cache-Control", "private, no-store");
        return c.json({ data: items });
    })
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        // RLS limits this to the caller's own tasks and those of lists shared with them.
        const [task] = await withCallerRls(c, async (tx) =>
            withTagIds(tx, await tx.select().from(tasks).where(eq(tasks.id, id))),
        );

        throwIfNotFound(task, "Task");

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: task });
    })
    .get("/:id/tags", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const associations = await withCallerRls(c, async (tx, userId) => {
            // Tags on a shared task belong to its owner: everyone else sees none.
            if (await taskAccess(tx, userId, id).then((access) => access && access.role !== "owner")) return [];
            await assertTaskOwnership(tx, userId, id);

            return tx
                .select({
                    id: tags.id,
                    userId: tags.userId,
                    name: tags.name,
                    color: tags.color,
                    createdAt: tags.createdAt,
                })
                .from(taskTags)
                .innerJoin(tags, eq(taskTags.tagId, tags.id))
                .where(eq(taskTags.taskId, id));
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: associations });
    })
    .post("/batch/delete", apiValidator("json", batchDeleteSchema), async (c) => {
        const { taskIds } = c.req.valid("json");

        const { deleted, accesses } = await withCallerRls(c, async (tx, userId) => {
            const groups = await tasksByOwner(tx, userId, taskIds, { skipMissing: true });
            for (const { access } of groups) requireOwner(access);
            return { deleted: await deleteTasks(tx, userId, taskIds), accesses: groups.map((group) => group.access) };
        });
        noteAudience(c, ...accesses);
        for (const row of deleted) noteChange(c, { type: "task.gone", id: row.id });
        return c.json({ data: deleted.map((row) => toTask(row, [])) });
    })
    // Empty Trash. Registered before `/:id` so "trash" never reaches the id route.
    .delete("/trash", async (c) => {
        const deleted = await withCallerRls(c, (tx, userId) => deleteTrashedTasks(tx, userId));
        return c.json({ data: { deleted } });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const { deleted, accesses } = await withCallerRls(c, async (tx, userId) => {
            const groups = await tasksByOwner(tx, userId, [id], { skipMissing: true });
            for (const { access } of groups) requireOwner(access);
            return { deleted: (await deleteTasks(tx, userId, [id]))[0], accesses: groups.map((group) => group.access) };
        });

        throwIfNotFound(deleted, "Task");
        noteAudience(c, ...accesses);
        noteChange(c, { type: "task.gone", id });
        return c.json({ data: toTask(deleted, []) });
    })
    .delete("/:id/tags/:tagId", apiValidator("param", taskTagParamSchema), async (c) => {
        const { id: taskId, tagId } = c.req.valid("param");

        const deleted = await withCallerRls(c, async (tx, userId) => {
            requireOwner(await taskAccess(tx, userId, taskId));
            await assertTaskOwnership(tx, userId, taskId);

            const [row] = await tx
                .delete(taskTags)
                .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)))
                .returning();
            return row;
        });

        throwIfNotFound(deleted, "Tag association");
        return c.json({ data: { success: true } });
    });
