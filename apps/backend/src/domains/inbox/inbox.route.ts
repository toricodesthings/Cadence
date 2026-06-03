import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { parseCanonicalNlpEnvelope, type CanonicalNlpSnapshot, type ParsedEntity } from "@cadence/nlp";
import { getDbClient } from "../../platform/db";
import { checkIdempotency, getIdempotencyKey, recordMutation } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { withRls } from "../../platform/rls";
import { inboxItems, inboxSections, tasks, taskTags, taskNlpMetadata, taskNlpMetadataHistory, projects, tags, users } from "../../db/schema";
import { insertInboxItemSchema, updateInboxItemSchema, insertInboxSectionSchema, updateInboxSectionSchema, processInboxItemSchema } from "./inbox.schema";
import { uuidParamSchema } from "../../platform/common-schemas";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import { normalizeTaskTemporalFields } from "../tasks/task-normalization";
import { validateTaskRecurrenceRule } from "../tasks/task-recurrence";
import { sourceSurfaceSchema } from "../tasks/tasks.schema";
import { loadNlpRuntime, inferTaskFieldsFromParse, persistNlpSnapshot, isDateOnlyValue } from "../tasks/task-nlp";

export const inboxRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // ── Atomic Inbox→Task Processing (Section 11.2C) ──
    .post("/:id/process", apiValidator("param", uuidParamSchema), apiValidator("json", processInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const title = body.title;
        const scheduledDate = body.scheduledDate ?? undefined;
        const dueDate = body.dueDate ?? undefined;
        const scheduledStart = body.scheduledStart ?? undefined;
        const scheduledEnd = body.scheduledEnd ?? undefined;
        const isAllDay = body.isAllDay ?? undefined;
        const projectId = body.projectId ?? undefined;
        const tagIds = body.tagIds ?? undefined;
        const priority = body.priority ?? undefined;
        const durationEstimate = body.durationEstimate ?? undefined;
        const recurrenceRule = body.recurrenceRule ?? undefined;
        const waitingOn = body.waitingOn ?? undefined;
        const nlp = body.nlp ?? undefined;
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const result = await withRls(db, userId, async (tx) => {
            // Idempotency guard
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(tasks).where(and(eq(tasks.id, existingId), eq(tasks.userId, userId)));
                if (existing) return { task: existing, alreadyProcessed: true };
            }

            // Verify inbox item exists and belongs to user
            const [item] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)));
            throwIfNotFound(item, "Inbox item");

            const nlpRuntime = await loadNlpRuntime(tx, userId);
            const envelope = nlp ?? {
                rawInput: item.rawText,
                sourceSurface: sourceSurfaceSchema.parse(item.sourceSurface ?? "inbox"),
                dateStyle: ((nlpRuntime.settings as any).dateTime?.dateStyle ?? "mdy") as "mdy" | "dmy" | "ymd",
                dismissedEntityIds: Array.from(nlpRuntime.dismissedEntityIds),
                userOverrides: {},
            };
            const parsed = parseCanonicalNlpEnvelope(envelope, {
                context: nlpRuntime.context,
            });
            const confidenceThreshold = (((nlpRuntime.settings as any).tasks?.intelligence?.confidenceThreshold ?? "medium") as "high" | "medium" | "low");
            const inferred = inferTaskFieldsFromParse(
                parsed,
                {
                    projectId,
                    tagIds,
                    priority,
                    durationEstimate,
                    waitingOn,
                    recurrenceRule,
                    scheduledDate,
                    dueDate,
                    scheduledStart,
                    scheduledEnd,
                    isAllDay,
                },
                confidenceThreshold,
            );

            let temporalFields: ReturnType<typeof normalizeTaskTemporalFields>;
            if (
                dueDate !== undefined
                || scheduledStart !== undefined
                || scheduledEnd !== undefined
                || isAllDay !== undefined
            ) {
                temporalFields = normalizeTaskTemporalFields({
                    dueDate,
                    scheduledStart,
                    scheduledEnd,
                    isAllDay: isAllDay ?? (scheduledStart ? false : true),
                });
            } else if (scheduledDate !== undefined) {
                if (isDateOnlyValue(scheduledDate)) {
                    temporalFields = normalizeTaskTemporalFields({
                        isAllDay: true,
                        dueDate: scheduledDate,
                    });
                } else {
                    temporalFields = normalizeTaskTemporalFields({
                        isAllDay: false,
                        scheduledStart: scheduledDate,
                    });
                }
            } else if (inferred.scheduledDate !== undefined && inferred.scheduledDate !== null) {
                if (isDateOnlyValue(inferred.scheduledDate)) {
                    temporalFields = normalizeTaskTemporalFields({
                        isAllDay: true,
                        dueDate: inferred.scheduledDate,
                    });
                } else {
                    temporalFields = normalizeTaskTemporalFields({
                        isAllDay: false,
                        scheduledStart: inferred.scheduledDate,
                    });
                }
            } else {
                temporalFields = normalizeTaskTemporalFields({ isAllDay: true });
            }

            const taskTagIds = Array.from(new Set([...(tagIds ?? []), ...(inferred.tagIds ?? [])]));
            const taskValues = {
                userId,
                title,
                orderIndex: 0,
                state: "ACTIVE" as const,
                projectId: inferred.projectId !== undefined ? inferred.projectId : projectId,
                priority: inferred.priority ?? priority ?? 0,
                durationEstimate: inferred.durationEstimate ?? durationEstimate ?? null,
                recurrenceRule: inferred.recurrenceRule ?? recurrenceRule ?? null,
                waitingOn: inferred.waitingOn ?? waitingOn ?? null,
                ...temporalFields,
            };

            validateTaskRecurrenceRule(taskValues.recurrenceRule, taskValues.scheduledStart ?? null);

            await assertOwnership(tx, userId, {
                projectId: taskValues.projectId,
                tagIds: taskTagIds,
            });

            // 1. Create the task atomically
            const [task] = await tx
                .insert(tasks)
                .values(taskValues)
                .returning();

            if (taskTagIds.length > 0) {
                await tx.insert(taskTags).values(
                    taskTagIds.map((tagId) => ({ taskId: task.id, tagId })),
                );
            }

            await persistNlpSnapshot(tx, parsed, task.id, userId);

            // 2. Transition inbox item (never delete — preserves audit trail)
            await tx
                .update(inboxItems)
                .set({
                    captureStatus: "placed",
                    placedTaskId: task.id,
                    processed: true,
                    analysisStatus: "applied",
                    analysisVersion: parsed.parserVersion,
                    analysisSummary: parsed.summary,
                    analysis: parsed as unknown as Record<string, unknown>,
                    sourceSurface: parsed.sourceSurface,
                })
                .where(eq(inboxItems.id, id));

            await recordMutation(tx, userId, idempotencyKey, task.id);

            return { task, alreadyProcessed: false };
        });

        return c.json({ data: result.task }, result.alreadyProcessed ? 200 : 201);
    })
    .post("/", apiValidator("json", insertInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const item = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, existingId), eq(inboxItems.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(inboxItems)
                .values({ ...body, userId })
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: item }, 201);
    })
    // ── Inbox Sections ──
    .post("/sections", apiValidator("json", insertInboxSectionSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        const idempotencyKey = getIdempotencyKey(c);
        const db = getDbClient(c.env);

        const section = await withRls(db, userId, async (tx) => {
            const existingId = await checkIdempotency(tx, userId, idempotencyKey);
            if (existingId) {
                const [existing] = await tx.select().from(inboxSections).where(and(eq(inboxSections.id, existingId), eq(inboxSections.userId, userId)));
                if (existing) return existing;
            }

            const [row] = await tx
                .insert(inboxSections)
                .values({ ...body, userId })
                .returning();

            await recordMutation(tx, userId, idempotencyKey, row.id);
            return row;
        });

        return c.json({ data: section }, 201);
    })
    .patch("/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, (tx) =>
            tx
                .update(inboxItems)
                .set(body)
                .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
                .returning(),
        );

        throwIfNotFound(updated, "Inbox item");

        return c.json({ data: updated });
    })
    .patch("/sections/:id", apiValidator("param", uuidParamSchema), apiValidator("json", updateInboxSectionSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const db = getDbClient(c.env);

        const [updated] = await withRls(db, userId, (tx) =>
            tx
                .update(inboxSections)
                .set(body)
                .where(and(eq(inboxSections.id, id), eq(inboxSections.userId, userId)))
                .returning(),
        );

        throwIfNotFound(updated, "Inbox section");

        return c.json({ data: updated });
    })
    .get("/", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const items = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(inboxItems)
                .where(and(eq(inboxItems.userId, userId), eq(inboxItems.processed, false)))
                .orderBy(inboxItems.createdAt),
        );

        return c.json({ data: items });
    })
    .get("/sections", async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);

        const sections = await withRls(db, userId, (tx) =>
            tx
                .select()
                .from(inboxSections)
                .where(eq(inboxSections.userId, userId))
                .orderBy(inboxSections.orderIndex),
        );

        return c.json({ data: sections });
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [deleted] = await withRls(db, userId, (tx) =>
            tx
                .delete(inboxItems)
                .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
                .returning(),
        );

        throwIfNotFound(deleted, "Inbox item");

        return c.json({ data: deleted });
    })
    .delete("/sections/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const db = getDbClient(c.env);

        const [deleted] = await withRls(db, userId, (tx) =>
            tx
                .delete(inboxSections)
                .where(and(eq(inboxSections.id, id), eq(inboxSections.userId, userId)))
                .returning(),
        );

        throwIfNotFound(deleted, "Inbox section");

        return c.json({ data: deleted });
    });
