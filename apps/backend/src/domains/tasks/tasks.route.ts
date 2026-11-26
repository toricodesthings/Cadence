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
import { AppError, assertNoConflict, throwIfNotFound } from "../../platform/errors";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parseCanonicalNlpEnvelope, type CanonicalNlpEnvelope } from "@cadence/nlp";
import { tasks, tags, taskTags, taskNlpMetadata } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { checkIdempotency, getIdempotencyKey, recordMutation, storedResult } from "../../platform/idempotency";
import { withRls } from "../../platform/rls";
import { withCallerRls } from "../../platform/caller-rls";
import { readEffortEvidence, readTaskBatch, readTasks } from "./tasks.read";
import { CONFIDENCE_TIERS } from "@cadence/nlp/core";
import { hasTaskTemporalMutation } from "@cadence/domain/task-temporal";
import { computeGappedOrderIndex } from "@cadence/domain/ordering";
import { apiValidator } from "../../platform/validation";
import type { AuthVariables } from "../../platform/auth";
import { uuidParamSchema } from "@cadence/contracts/common";
import { taskTagSchema } from "@cadence/contracts/tag";
import {
    canonicalNlpEnvelopeSchema,
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
    dropTaskLearningRows,
    duplicateTask,
    justCompleted,
    moveTaskToSharedList,
    overlayPersonalReminders,
    placeTasks,
    rescheduleTasks,
    setTaskState,
    slotsOf,
    temporalColumns,
    toTask,
    trackTaskChanges,
    updateTask,
    upsertPersonalReminder,
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

const nlpInputFields = canonicalNlpEnvelopeSchema
    .pick({ rawInput: true, sourceSurface: true, dateStyle: true, dismissedEntityIds: true, userOverrides: true })
    .partial({ sourceSurface: true, dateStyle: true, dismissedEntityIds: true, userOverrides: true });

const nlpReparseSchema = z.object({
    ...nlpInputFields.shape,
    nlp: nlpInputFields.optional(),
    parseResult: z.record(z.string(), z.unknown()).optional(),
    cleanedTitle: z.string().max(500).optional(),
    confidenceTier: z.enum(CONFIDENCE_TIERS).optional(),
    parserVersion: z.string().max(20).optional(),
});

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

function actingAs(access: ListAccess | null, userId: string) {
    requireEdit(access);
    const ownerId = access?.ownerId ?? userId;
    return { ownerId, guest: ownerId !== userId };
}

function announce(c: RouteContext, accesses: (ListAccess | null)[], rows: Task[]) {
    noteAudience(c, ...accesses);
    for (const task of rows) noteChange(c, { type: "task", task });
}

type Group = { access: ListAccess | null; ids: string[]; ownerId: string; guest: boolean };

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

        const { task, broadcast, access, guest } = await withRls(db, userId, async (tx) => {
            let access = body.projectId ? await listAccess(tx, userId, body.projectId) : null;
            const { ownerId, guest } = actingAs(access, userId);
            const replayed = await replayedTask(tx, userId, idempotencyKey, ownerId);
            if (replayed) return { task: replayed, broadcast: replayed, access, guest };
            if (guest) await assertListRoom(tx, access!.listId);

            const fromWords = nlp ? await parseCreateNlp(tx, userId, nlp) : null;
            const parsed = fromWords?.parsed ?? null;

            const zone = await userZone(tx, userId);
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
            const inferred =
                inferredFromWords && guest ? { ...inferredFromWords, projectId: undefined } : inferredFromWords;

            const allTagIds = Array.from(new Set([...(tagIds ?? []), ...(inferred?.tagIds ?? [])]));
            const guestReminder = guest
                ? { reminderAt: body.reminderAt ?? null, reminderSilenced: body.reminderSilenced }
                : null;
            const sharedFields = guest ? { ...body, reminderAt: null, reminderSilenced: false } : body;
            const taskBody = inferred
                ? withInferred(sharedFields, inferred, zone)
                : {
                      ...sharedFields,
                      ...temporalColumns(sharedFields, zone),
                  };

            if (taskBody.projectId && taskBody.projectId !== body.projectId)
                access = await listAccess(tx, userId, taskBody.projectId);
            const { row, tagIds: storedTagIds } = await createTask(tx, ownerId, taskBody, allTagIds, userId);
            const personal =
                guestReminder && guestReminder.reminderAt !== null
                    ? await upsertPersonalReminder(tx, userId, row.id, guestReminder)
                    : null;

            if (parsed && !guest) {
                await persistNlpSnapshot(tx, parsed, row.id, userId);
            }

            await recordMutation(tx, userId, idempotencyKey, row.id);
            const broadcast = toTask(row, storedTagIds);
            const task = personal ? { ...broadcast, ...personal } : broadcast;
            return { task, broadcast, access, guest };
        });

        announce(c, [access], [broadcast]);
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
            await taskAccess(tx, userId, id);

            const [tag] = await tx
                .select({ id: tags.id })
                .from(tags)
                .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));

            throwIfNotFound(tag, "Tag");

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
            broadcast,
            access,
            destAccess,
            guest,
        } = await withRls(db, userId, async (tx) => {
            const [{ access }] = await tasksByOwner(tx, userId, [id]);
            const ownerId = access?.ownerId ?? userId;
            const guest = ownerId !== userId;
            const { reminderAt, reminderSilenced, ...sharedBody } = body;
            const hasPersonal = reminderAt !== undefined || reminderSilenced !== undefined;
            const hasShared = Object.keys(sharedBody).length > 0;

            if (guest && hasPersonal && !hasShared) {
                await upsertPersonalReminder(tx, userId, id, { reminderAt, reminderSilenced });
                const rows = await overlayPersonalReminders(
                    tx,
                    userId,
                    await tx.select().from(tasks).where(eq(tasks.id, id)),
                );
                const [task] = await withTagIds(tx, rows);
                throwIfNotFound(task, "Task");
                return { task, broadcast: null, access, destAccess: null, guest };
            }

            requireEdit(access);
            if (guest && body.projectId !== undefined && body.projectId !== access!.listId) {
                throw new AppError(
                    403,
                    "OWNER_ONLY",
                    "Only the owner of this list can move its tasks to another list.",
                );
            }
            if (body.takenBy !== undefined) {
                if (body.takenBy !== null && body.takenBy !== userId) {
                    throw new AppError(403, "TAKE_SELF_ONLY", "You can only take a task for yourself.");
                }
                if (body.takenBy === null) {
                    const [current] = await tx
                        .select({ takenBy: tasks.takenBy })
                        .from(tasks)
                        .where(and(eq(tasks.id, id), eq(tasks.userId, ownerId)));
                    if (current?.takenBy && current.takenBy !== userId) requireOwner(access);
                }
            }

            const destAccess =
                !guest && body.projectId && body.projectId !== access?.listId
                    ? await listAccess(tx, userId, body.projectId)
                    : null;
            if (destAccess) {
                requireEdit(destAccess);
                await assertListRoom(tx, destAccess.listId);
            }
            if (destAccess && destAccess.ownerId !== userId) {
                if (expectedUpdatedAt) {
                    const [existing] = await tx
                        .select({ updatedAt: tasks.updatedAt })
                        .from(tasks)
                        .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                        .for("update");
                    throwIfNotFound(existing, "Task");
                    assertNoConflict(expectedUpdatedAt, existing.updatedAt, "Task");
                }
                const moved = await moveTaskToSharedList(tx, id, destAccess.listId, body.sectionId ?? null);
                if (!moved) throw new AppError(404, "NOT_FOUND", "Task or list not found");
                const { projectId: _p, sectionId: _s, ...restShared } = sharedBody;
                let row: typeof tasks.$inferSelect | undefined;
                if (Object.keys(restShared).length > 0) {
                    row = await updateTask(tx, destAccess.ownerId, id, restShared);
                } else {
                    const [selected] = await tx.select().from(tasks).where(eq(tasks.id, id));
                    row = selected;
                }
                throwIfNotFound(row, "Task");
                if (hasPersonal) {
                    await upsertPersonalReminder(tx, userId, id, { reminderAt, reminderSilenced });
                }
                const [broadcast] = await withTagIds(tx, [row]);
                const [task] = await withTagIds(tx, await overlayPersonalReminders(tx, userId, [row]));
                return { task, broadcast, access, destAccess, guest: true };
            }
            if (destAccess && destAccess.audience.length > 1) {
                await dropTaskLearningRows(tx, userId, id);
            }
            if (moving || findTime) from = await slotsOf(tx, ownerId, [id]);
            const patch = guest ? sharedBody : body;
            const row = await updateTask(tx, ownerId, id, patch, expectedUpdatedAt);
            if (guest && hasPersonal) {
                await upsertPersonalReminder(tx, userId, id, { reminderAt, reminderSilenced });
            }
            const [broadcast] = await withTagIds(tx, [row]);
            const [task] = guest
                ? await withTagIds(tx, await overlayPersonalReminders(tx, userId, [row]))
                : [broadcast];
            return { task, broadcast, access, destAccess, guest };
        });
        if (broadcast) announce(c, [access, destAccess], [broadcast]);
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
                if (orderedTaskIds && orderedTaskIds.length > 1) {
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

                const rows = await tx
                    .update(tasks)
                    .set({ orderIndex, updatedAt: sql`NOW()` })
                    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                    .returning();
                return { updated: (await withTagIds(tx, rows))[0], access };
            });

            throwIfNotFound(updated, "Task");
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

        const [task] = await withCallerRls(c, async (tx, userId) =>
            withTagIds(
                tx,
                await overlayPersonalReminders(tx, userId, await tx.select().from(tasks).where(eq(tasks.id, id))),
            ),
        );

        throwIfNotFound(task, "Task");

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: task });
    })
    .get("/:id/tags", apiValidator("param", uuidParamSchema), async (c) => {
        const { id } = c.req.valid("param");

        const associations = await withCallerRls(c, async (tx, userId) => {
            await taskAccess(tx, userId, id);

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
                .where(and(eq(taskTags.taskId, id), eq(tags.userId, userId)));
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
            await taskAccess(tx, userId, taskId);

            const [row] = await tx
                .delete(taskTags)
                .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)))
                .returning();
            return row;
        });

        throwIfNotFound(deleted, "Tag association");
        return c.json({ data: { success: true } });
    });
