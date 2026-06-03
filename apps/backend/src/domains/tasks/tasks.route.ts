import { Hono } from "hono";
import { and, between, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { parseCanonicalNlpEnvelope, type CanonicalNlpEnvelope, type CanonicalNlpSnapshot, type ParsedEntity } from "@cadence/nlp";
import { tasks, tags, taskTags, taskNlpMetadata, taskNlpMetadataHistory, projects, users } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { AppError, throwIfNotFound, assertNoConflict } from "../../platform/errors";
import { assertOwnership } from "../../platform/ownership";
import { checkIdempotency, getIdempotencyKey, recordMutation } from "../../platform/idempotency";
import { trackCompletion, trackReschedule, trackEvent, trackBatchCompletion, trackBatchEvents } from "../../platform/metrics";
import { withRls } from "../../platform/rls";
import { normalizeTaskFilters, type NormalizedTaskFilters } from "./task-filters";
import {
    hasTaskTemporalMutation,
    normalizeTaskTemporalFields,
} from "./task-normalization";
import {
    expandScheduleScopedTasks,
    isScheduleScopedTaskQuery,
    validateTaskRecurrenceRule,
} from "./task-recurrence";
import { apiValidator } from "../../platform/validation";
import type { AuthVariables } from "../../platform/auth";
import { uuidParamSchema } from "../../platform/common-schemas";
import { taskTagSchema } from "../tags/tags.schema";
import {
    sourceSurfaceSchema,
    batchRescheduleSchema,
    batchStateSchema,
    insertTaskSchema,
    reorderTaskSchema,
    taskFiltersSchema,
    taskListQuerySchema,
    updateTaskSchema,
} from "./tasks.schema";
import type { Env } from "../../types/env";
import { loadNlpRuntime, inferTaskFieldsFromParse, persistNlpSnapshot, isDateOnlyValue } from "./task-nlp";

const taskTagParamSchema = z.object({
    id: z.string().uuid(),
    tagId: z.string().uuid(),
});

const nlpReparseSchema = z.object({
    rawInput: z.string().max(2000),
    sourceSurface: sourceSurfaceSchema.optional(),
    dateStyle: z.enum(["mdy", "dmy", "ymd"]).optional(),
    dismissedEntityIds: z.array(z.string().min(1).max(100)).optional(),
    userOverrides: z.record(z.string(), z.unknown()).optional(),
    nlp: z.object({
        rawInput: z.string().max(2000),
        sourceSurface: sourceSurfaceSchema.optional(),
        dateStyle: z.enum(["mdy", "dmy", "ymd"]).optional(),
        dismissedEntityIds: z.array(z.string().min(1).max(100)).optional(),
        userOverrides: z.record(z.string(), z.unknown()).optional(),
    }).optional(),
    parseResult: z.record(z.string(), z.unknown()).optional(),
    cleanedTitle: z.string().max(500).optional(),
    confidenceTier: z.enum(["high", "medium", "low"]).optional(),
    parserVersion: z.string().max(20).optional(),
});

function buildEffectiveTaskAnchorExpression() {
    return sql<string>`case
        when ${tasks.isAllDay} = true then coalesce(${tasks.dueDate}, ${tasks.scheduledStart})
        else coalesce(${tasks.scheduledStart}, ${tasks.dueDate})
    end`;
}

export function buildTaskWhereClause(userId: string, filters: NormalizedTaskFilters): (SQL<unknown> | undefined)[] {
    const conditions: (SQL<unknown> | undefined)[] = [eq(tasks.userId, userId)];

    if (filters.state) {
        conditions.push(eq(tasks.state, filters.state));
    }
    if (filters.projectId) {
        conditions.push(eq(tasks.projectId, filters.projectId));
    }

    if (filters.scheduledDate) {
        const start = `${filters.scheduledDate}T00:00:00.000Z`;
        const end = `${filters.scheduledDate}T23:59:59.999Z`;
        conditions.push(or(between(tasks.scheduledStart, start, end), between(tasks.dueDate, start, end)));
    }

    if (filters.scheduledRangeStart && filters.scheduledRangeEnd) {
        conditions.push(
            or(
                between(tasks.scheduledStart, filters.scheduledRangeStart, filters.scheduledRangeEnd),
                between(tasks.dueDate, filters.scheduledRangeStart, filters.scheduledRangeEnd),
            ),
        );
    }

    if (filters.priority !== undefined) {
        conditions.push(eq(tasks.priority, filters.priority));
    }
    if (filters.isPinned !== undefined) {
        conditions.push(eq(tasks.isPinned, filters.isPinned));
    }
    if (filters.effort !== undefined) {
        conditions.push(eq(tasks.effort, filters.effort));
    }
    if (filters.notBeforeBefore !== undefined) {
        conditions.push(or(lte(tasks.notBefore, filters.notBeforeBefore), isNull(tasks.notBefore)));
    }
    if (filters.hasNoDate) {
        conditions.push(and(isNull(tasks.scheduledStart), isNull(tasks.dueDate)));
    }
    if (filters.hasNoProject) {
        conditions.push(isNull(tasks.projectId));
    }
    if (filters.effectiveOnOrBeforeDateTime) {
        conditions.push(lte(buildEffectiveTaskAnchorExpression(), filters.effectiveOnOrBeforeDateTime));
    }

    return conditions;
}

function getTemporalFieldsForPersistence(fields: {
    dueDate?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    isAllDay?: boolean | null;
}) {
    return normalizeTaskTemporalFields(fields);
}

export const taskRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post("/:id/duplicate", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const duplicate = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(tasks).where(and(eq(tasks.id, existingId), eq(tasks.userId, userId)));
                if (existing) return existing;
            }

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
                    title: `${original.title} (copy)`,
                    content: original.content,
                    state: "ACTIVE",
                    orderIndex: original.orderIndex + 0.001,
                    isAllDay: original.isAllDay,
                    dueDate: original.dueDate,
                    scheduledStart: original.scheduledStart,
                    scheduledEnd: original.scheduledEnd,
                    durationEstimate: original.durationEstimate,
                    timezoneLocked: original.timezoneLocked,
                    priority: original.priority,
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

            await recordMutation(tx, userId, idempotencyKey, dup.id);
            return dup;
        });

        return c.json({ data: duplicate }, 201);
    })
    .post("/:id/reparse", apiValidator("param", uuidParamSchema), apiValidator("json", nlpReparseSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const metadata = await withRls(db, userId, async (tx) => {
            // Idempotency guard: return existing NLP metadata if already processed
            const dedupId = await checkIdempotency(tx, userId, idempotencyKey);
            if (dedupId) {
                const [existing] = await tx
                    .select()
                    .from(taskNlpMetadata)
                    .where(and(eq(taskNlpMetadata.taskId, id), eq(taskNlpMetadata.userId, userId)));
                if (existing) return existing;
            }

            const [task] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
            throwIfNotFound(task, "Task");

            const nlpRuntime = await loadNlpRuntime(tx, userId);
            const fallbackEnvelope = {
                rawInput: body.rawInput,
                sourceSurface: (body.sourceSurface ?? "quick_add") as CanonicalNlpEnvelope["sourceSurface"],
                dateStyle: (body.dateStyle ?? (nlpRuntime.settings.dateTime?.dateStyle ?? "mdy")) as CanonicalNlpEnvelope["dateStyle"],
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
            });

            const [row] = await (async () => {
                const existing = await tx
                    .select()
                    .from(taskNlpMetadata)
                    .where(and(eq(taskNlpMetadata.taskId, id), eq(taskNlpMetadata.userId, userId)))
                    .limit(1);

                if (existing[0]) {
                    await tx.insert(taskNlpMetadataHistory).values({
                        taskId: existing[0].taskId,
                        userId: existing[0].userId,
                        parserVersion: existing[0].parserVersion,
                        sourceSurface: existing[0].sourceSurface,
                        rawInput: existing[0].rawInput,
                        cleanedTitle: existing[0].cleanedTitle,
                        parseResult: existing[0].parseResult as unknown as Record<string, unknown>,
                        confidenceTier: existing[0].confidenceTier,
                        isCurrent: false,
                    });

                    const [updated] = await tx
                        .update(taskNlpMetadata)
                        .set({
                            rawInput: parsed.rawInput,
                            sourceSurface: parsed.sourceSurface,
                            parseResult: parsed as unknown as Record<string, unknown>,
                            cleanedTitle: parsed.cleanedTitle,
                            confidenceTier: parsed.overallConfidence ?? "medium",
                            parserVersion: parsed.parserVersion,
                            isCurrent: true,
                        })
                        .where(and(eq(taskNlpMetadata.taskId, id), eq(taskNlpMetadata.userId, userId)))
                        .returning();
                    return [updated];
                }

                return tx
                    .insert(taskNlpMetadata)
                    .values({
                        taskId: id,
                        userId,
                        rawInput: parsed.rawInput,
                        sourceSurface: parsed.sourceSurface,
                        parseResult: parsed as unknown as Record<string, unknown>,
                        cleanedTitle: parsed.cleanedTitle,
                        confidenceTier: parsed.overallConfidence ?? "medium",
                        parserVersion: parsed.parserVersion,
                        isCurrent: true,
                    })
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

        const task = await withRls(db, userId, async (tx) => {
                // Idempotency: return existing result if this mutation was already processed
                const existingId = await checkIdempotency(tx, userId, idempotencyKey);
                if (existingId) {
                    const [existing] = await tx.select().from(tasks).where(and(eq(tasks.id, existingId), eq(tasks.userId, userId)));
                    if (existing) return existing;
                }

                const nlpRuntime = nlp
                    ? await loadNlpRuntime(tx, userId)
                    : null;
                const parsed = nlp
                    ? parseCanonicalNlpEnvelope(
                        {
                            ...nlp,
                            dismissedEntityIds: [
                                ...(nlp.dismissedEntityIds ?? []),
                                ...(nlpRuntime ? Array.from(nlpRuntime.dismissedEntityIds) : []),
                            ],
                        },
                        {
                            context: nlpRuntime?.context,
                        },
                    )
                    : null;

                const inferred = parsed
                    ? inferTaskFieldsFromParse(
                        parsed,
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
                            isAllDay: body.dueDate !== undefined || body.scheduledStart !== undefined || body.scheduledEnd !== undefined
                                ? body.isAllDay
                                : undefined,
                        },
                        (nlpRuntime?.settings.tasks?.intelligence?.confidenceThreshold ?? "medium") as "high" | "medium" | "low",
                    )
                    : null;

                const explicitTagIds = tagIds ?? [];
                const parsedTagIds = inferred?.tagIds ?? [];
                const allTagIds = Array.from(new Set([...explicitTagIds, ...parsedTagIds]));
                const taskBody = parsed
                    ? {
                        ...body,
                        projectId: inferred?.projectId !== undefined ? inferred.projectId : body.projectId,
                        priority: inferred?.priority ?? body.priority,
                        durationEstimate: inferred?.durationEstimate ?? body.durationEstimate,
                        waitingOn: inferred?.waitingOn ?? body.waitingOn,
                        recurrenceRule: inferred?.recurrenceRule ?? body.recurrenceRule,
                        ...getTemporalFieldsForPersistence({
                            dueDate: inferred?.dueDate ?? body.dueDate ?? null,
                            scheduledStart: inferred?.scheduledStart ?? body.scheduledStart ?? null,
                            scheduledEnd: inferred?.scheduledEnd ?? body.scheduledEnd ?? null,
                            isAllDay: inferred?.isAllDay ?? body.isAllDay ?? true,
                        }),
                    }
                    : {
                        ...body,
                        ...getTemporalFieldsForPersistence(body),
                    };

                validateTaskRecurrenceRule(taskBody.recurrenceRule, taskBody.scheduledStart ?? null);

                await assertOwnership(tx, userId, {
                    projectId: taskBody.projectId,
                    sectionId: taskBody.sectionId,
                    tagIds: allTagIds,
                });

                const [row] = await tx
                    .insert(tasks)
                    .values({
                        ...taskBody,
                        userId,
                    })
                    .returning();

                if (allTagIds.length > 0) {
                    await tx.insert(taskTags).values(
                        allTagIds.map((tagId) => ({ taskId: row.id, tagId })),
                    );
                }

                if (parsed) {
                    await persistNlpSnapshot(tx, parsed, row.id, userId);
                }

                await recordMutation(tx, userId, idempotencyKey, row.id);
                return row;
            });

        try {
            c.executionCtx.waitUntil(
                trackEvent(getDbClient(c.env), userId, "task.create", { taskId: task.id }),
            );
        } catch {
            // executionCtx may not be available in test environments
        }

        return c.json({ data: task }, 201);
    })
    .post("/:id/tags", apiValidator("param", uuidParamSchema), apiValidator("json", taskTagSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { tagId } = c.req.valid("json");
        const db = getDbClient(c.env);

        const association = await withRls(db, userId, async (tx) => {
            const [task] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

            throwIfNotFound(task, "Task");

            const [tag] = await tx
                .select({ id: tags.id })
                .from(tags)
                .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));

            throwIfNotFound(tag, "Tag");

            const [assoc] = await tx
                .insert(taskTags)
                .values({ taskId: id, tagId })
                .returning();
            return assoc;
        });

        return c.json({ data: association }, 201);
    })
    .post("/batch/reschedule", apiValidator("json", batchRescheduleSchema), async (c) => {
        const userId = c.get("userId");
        const { taskIds, scheduledStart, isAllDay } = c.req.valid("json");
        const db = getDbClient(c.env);
        const temporalFields = getTemporalFieldsForPersistence({
            isAllDay,
            scheduledStart,
        });

        const updatedTasks = await withRls(db, userId, async (tx) =>
            tx
                .update(tasks)
                .set({ ...temporalFields, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
                .returning(),
        );

        const db2 = getDbClient(c.env);
        for (const id of taskIds) {
            c.executionCtx.waitUntil(
                trackReschedule(db2, id, userId, temporalFields.scheduledStart ?? temporalFields.dueDate),
            );
        }
        c.executionCtx.waitUntil(
            trackBatchEvents(db2, userId, taskIds.map((id) => ({ event: "task.reschedule", metadata: { taskId: id } }))),
        );

        return c.json({ data: updatedTasks });
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { expectedUpdatedAt, ...body } = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            const [existing] = await tx
                .select({
                    id: tasks.id,
                    isAllDay: tasks.isAllDay,
                    dueDate: tasks.dueDate,
                    scheduledStart: tasks.scheduledStart,
                    scheduledEnd: tasks.scheduledEnd,
                    updatedAt: tasks.updatedAt,
                })
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

            throwIfNotFound(existing, "Task");

            // Conflict detection: if client sends expectedUpdatedAt, verify it matches
            assertNoConflict(expectedUpdatedAt, existing.updatedAt, "Task");

            // Validate ownership of referenced entities
            await assertOwnership(tx, userId, {
                projectId: body.projectId,
                sectionId: body.sectionId,
            });

            validateTaskRecurrenceRule(body.recurrenceRule, body.scheduledStart ?? existing.scheduledStart);

            const temporalPatch = hasTaskTemporalMutation(body)
                ? getTemporalFieldsForPersistence({
                    isAllDay: body.isAllDay ?? existing.isAllDay,
                    dueDate: "dueDate" in body ? body.dueDate : existing.dueDate,
                    scheduledStart: "scheduledStart" in body ? body.scheduledStart : existing.scheduledStart,
                    scheduledEnd: "scheduledEnd" in body ? body.scheduledEnd : existing.scheduledEnd,
                })
                : {};

            const [row] = await tx
                .update(tasks)
                .set({ ...body, ...temporalPatch, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                .returning();
            return row;
        });

        if (hasTaskTemporalMutation(body)) {
            c.executionCtx.waitUntil(
                trackReschedule(getDbClient(c.env), id, userId, updated.scheduledStart ?? updated.dueDate),
            );
            c.executionCtx.waitUntil(
                trackEvent(getDbClient(c.env), userId, "task.reschedule", { taskId: id }),
            );
        }
        if (body.state === "COMPLETE") {
            c.executionCtx.waitUntil(trackCompletion(getDbClient(c.env), id, userId));
            c.executionCtx.waitUntil(
                trackEvent(getDbClient(c.env), userId, "task.complete", { taskId: id }),
            );
        }

        return c.json({ data: updated });
    })
    .patch("/:id/reorder", apiValidator("param", uuidParamSchema), apiValidator("json", reorderTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { orderIndex, orderedTaskIds } = c.req.valid("json");
        const db = getDbClient(c.env);

        const updated = await withRls(db, userId, async (tx) => {
            // If the client sent the full ordered list, rebalance all affected tasks
            if (orderedTaskIds && orderedTaskIds.length > 1) {
                const GAP = 1024;

                // Batch all reorder updates into a single UPDATE with CASE
                const caseChunks = orderedTaskIds.map(
                    (taskId, idx) => sql`WHEN ${taskId} THEN ${idx * GAP}`,
                );
                await tx.execute(sql`
                    UPDATE tasks
                    SET order_index = CASE id ${sql.join(caseChunks, sql` `)} END,
                        updated_at = NOW()
                    WHERE id IN ${sql`(${sql.join(orderedTaskIds.map((id) => sql`${id}`), sql`, `)})`}
                      AND user_id = ${userId}
                `);

                const [row] = await tx
                    .select()
                    .from(tasks)
                    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
                return row;
            }

            // Fallback: only update the single moved task
            const [row] = await tx
                .update(tasks)
                .set({ orderIndex, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                .returning();
            return row;
        });

        throwIfNotFound(updated, "Task");
        return c.json({ data: updated });
    })
    .patch("/batch/state", apiValidator("json", batchStateSchema), async (c) => {
        const userId = c.get("userId");
        const { taskIds, state } = c.req.valid("json");
        const db = getDbClient(c.env);

        const updatedTasks = await withRls(db, userId, async (tx) =>
            tx
                .update(tasks)
                .set({ state, updatedAt: sql`NOW()` })
                .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
                .returning(),
        );

        if (state === "COMPLETE") {
            const db2 = getDbClient(c.env);
            c.executionCtx.waitUntil(trackBatchCompletion(db2, taskIds, userId));
            c.executionCtx.waitUntil(
                trackBatchEvents(db2, userId, taskIds.map((id) => ({ event: "task.complete", metadata: { taskId: id } }))),
            );
        }

        return c.json({ data: updatedTasks });
    })
    .get("/", apiValidator("query", taskListQuerySchema), async (c) => {
        const userId = c.get("userId");
        const query = normalizeTaskFilters(c.req.valid("query"));
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, async (tx) => {
            const scheduleScoped = isScheduleScopedTaskQuery(query);
            const conditions = buildTaskWhereClause(
                userId,
                scheduleScoped
                    ? {
                        ...query,
                        scheduledDate: undefined,
                        scheduledRangeStart: undefined,
                        scheduledRangeEnd: undefined,
                    }
                    : query,
            );
            const returnedTasks = await tx.query.tasks.findMany({
                where: and(...conditions),
                orderBy: (taskTable, { asc, desc }) => [desc(taskTable.isPinned), asc(taskTable.orderIndex)],
                ...(scheduleScoped
                    ? {}
                    : {
                        limit: query.limit,
                        offset: query.offset,
                    }),
                with: {
                    tags: {
                        columns: {
                            tagId: true,
                        },
                    },
                },
            });

            const mappedTasks = returnedTasks.map((task) => ({
                ...task,
                tags: undefined,
                tagIds: task.tags.map((assoc) => assoc.tagId),
            }));

            return scheduleScoped ? expandScheduleScopedTasks(mappedTasks, query) : mappedTasks;
        });

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: items });
    })
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const task = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .select()
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
            return row;
        });

        throwIfNotFound(task, "Task");

        c.header("Cache-Control", "private, no-store");
        return c.json({ data: task });
    })
    .get("/:id/tags", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const associations = await withRls(db, userId, async (tx) => {
            const [task] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));

            throwIfNotFound(task, "Task");

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
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const deleted = await withRls(db, userId, async (tx) => {
            const [row] = await tx
                .delete(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
                .returning();
            return row;
        });

        throwIfNotFound(deleted, "Task");
        return c.json({ data: deleted });
    })
    .delete("/:id/tags/:tagId", apiValidator("param", taskTagParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id: taskId, tagId } = c.req.valid("param");
        const db = getDbClient(c.env);

        const deleted = await withRls(db, userId, async (tx) => {
            const [task] = await tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

            throwIfNotFound(task, "Task");

            const [row] = await tx
                .delete(taskTags)
                .where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)))
                .returning();
            return row;
        });

        throwIfNotFound(deleted, "Tag association");
        return c.json({ data: { success: true } });
    });
