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
import { normalizeSettings } from "../settings/settings.route";
import { sourceSurfaceSchema } from "../tasks/tasks.schema";

function confidenceRank(confidence: "high" | "medium" | "low") {
    return confidence === "high" ? 2 : confidence === "medium" ? 1 : 0;
}

function isDateOnlyValue(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function loadNlpRuntime(tx: any, userId: string) {
    const [user] = await tx
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    const [projectRows, tagRows] = await Promise.all([
        tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId)),
        tx.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, userId)),
    ]);

    const settings = normalizeSettings((user?.settings ?? {}) as Record<string, unknown>);
    const intelligence = (settings as any).tasks?.intelligence ?? {};

    return {
        settings,
        context: {
            projects: projectRows,
            tags: tagRows,
        },
        dismissedEntityIds: new Set<string>((intelligence.dismissedEntityIds as string[] | undefined) ?? []),
    };
}

function inferTaskFieldsFromParse(
    parsed: CanonicalNlpSnapshot,
    explicit: {
        projectId?: string | null;
        tagIds?: string[];
        priority?: number;
        durationEstimate?: number | null;
        waitingOn?: string | null;
        recurrenceRule?: string | null;
        scheduledDate?: string | null;
        dueDate?: string | null;
        scheduledStart?: string | null;
        scheduledEnd?: string | null;
        isAllDay?: boolean | null;
    },
    confidenceThreshold: "high" | "medium" | "low",
) {
    const thresholdRank = confidenceRank(confidenceThreshold);
    const entityRank = (entity: ParsedEntity) => confidenceRank(entity.confidence);
    const parsedTagIds = new Set<string>();
    let parsedProjectId: string | null | undefined;
    let parsedPriority: number | undefined;
    let parsedDuration: number | null | undefined;
    let parsedWaitingOn: string | null | undefined;
    let parsedRecurrence: string | null | undefined;
    let parsedScheduledDate: string | null | undefined;

    for (const entity of parsed.entities) {
        if (entityRank(entity) < thresholdRank) continue;

        switch (entity.type) {
            case "project": {
                if (explicit.projectId !== undefined) continue;
                const value = entity.normalizedValue as { resolvedId?: string; id?: string };
                parsedProjectId = value.resolvedId ?? value.id ?? parsedProjectId;
                break;
            }
            case "tag": {
                if (explicit.tagIds !== undefined) continue;
                const value = entity.normalizedValue as { resolvedId?: string; id?: string };
                const tagId = value.resolvedId ?? value.id;
                if (tagId) parsedTagIds.add(tagId);
                break;
            }
            case "priority": {
                if (explicit.priority !== undefined) continue;
                parsedPriority = entity.normalizedValue as number;
                break;
            }
            case "duration": {
                if (explicit.durationEstimate !== undefined) continue;
                const value = entity.normalizedValue as { minutes: number };
                parsedDuration = value.minutes;
                break;
            }
            case "waiting_on": {
                if (explicit.waitingOn !== undefined) continue;
                parsedWaitingOn = entity.normalizedValue as string;
                break;
            }
            case "recurrence": {
                if (explicit.recurrenceRule !== undefined) continue;
                const value = entity.normalizedValue as { rrule: string };
                parsedRecurrence = value.rrule;
                break;
            }
            case "due_date":
            case "scheduled_start": {
                if (
                    explicit.scheduledDate !== undefined
                    || explicit.dueDate !== undefined
                    || explicit.scheduledStart !== undefined
                    || explicit.scheduledEnd !== undefined
                    || explicit.isAllDay !== undefined
                ) {
                    continue;
                }
                const value = entity.normalizedValue as { date: string; datetime: string | null; hasTime: boolean };
                if (entity.type === "due_date" && value.hasTime) continue;
                parsedScheduledDate = entity.type === "scheduled_start" && value.datetime ? value.datetime : value.date;
                break;
            }
        }
    }

    return {
        projectId: explicit.projectId !== undefined ? explicit.projectId : parsedProjectId,
        tagIds: explicit.tagIds !== undefined ? explicit.tagIds : Array.from(parsedTagIds),
        priority: explicit.priority !== undefined ? explicit.priority : parsedPriority,
        durationEstimate: explicit.durationEstimate !== undefined ? explicit.durationEstimate : parsedDuration,
        waitingOn: explicit.waitingOn !== undefined ? explicit.waitingOn : parsedWaitingOn,
        recurrenceRule: explicit.recurrenceRule !== undefined ? explicit.recurrenceRule : parsedRecurrence,
        scheduledDate: explicit.scheduledDate !== undefined ? explicit.scheduledDate : parsedScheduledDate,
    };
}

async function persistNlpSnapshot(
    tx: any,
    snapshot: CanonicalNlpSnapshot,
    taskId: string,
    userId: string,
) {
    const [existing] = await tx
        .select()
        .from(taskNlpMetadata)
        .where(and(eq(taskNlpMetadata.taskId, taskId), eq(taskNlpMetadata.userId, userId)))
        .limit(1);

    const snapshotRecord = snapshot as unknown as Record<string, unknown>;
    const currentValues = {
        taskId,
        userId,
        parserVersion: snapshot.parserVersion,
        sourceSurface: snapshot.sourceSurface,
        rawInput: snapshot.rawInput,
        cleanedTitle: snapshot.cleanedTitle,
        parseResult: snapshotRecord,
        confidenceTier: snapshot.overallConfidence ?? "medium",
        isCurrent: true,
    };
    const updateValues = {
        parserVersion: snapshot.parserVersion,
        sourceSurface: snapshot.sourceSurface,
        rawInput: snapshot.rawInput,
        cleanedTitle: snapshot.cleanedTitle,
        parseResult: snapshotRecord,
        confidenceTier: snapshot.overallConfidence ?? "medium",
        isCurrent: true,
    };

    if (existing?.id) {
        await tx.insert(taskNlpMetadataHistory).values({
            taskId: existing.taskId,
            userId: existing.userId,
            parserVersion: existing.parserVersion,
            sourceSurface: existing.sourceSurface,
            rawInput: existing.rawInput,
            cleanedTitle: existing.cleanedTitle,
            parseResult: existing.parseResult as unknown as Record<string, unknown>,
            confidenceTier: existing.confidenceTier,
            isCurrent: false,
        });

        const [row] = await tx
            .update(taskNlpMetadata)
            .set(updateValues)
            .where(eq(taskNlpMetadata.taskId, taskId))
            .returning();
        return row;
    }

    const [row] = await tx.insert(taskNlpMetadata).values(currentValues).returning();
    return row;
}

export const inboxRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
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
    // ── Atomic Inbox→Task Processing (Section 11.2C) ──
    .post("/:id/process", apiValidator("param", uuidParamSchema), apiValidator("json", processInboxItemSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const { title, scheduledDate, dueDate, scheduledStart, scheduledEnd, isAllDay, projectId, tagIds, priority, durationEstimate, recurrenceRule, waitingOn, nlp } = c.req.valid("json");
        const title = body.title;
        const scheduledDate = body.scheduledDate ?? undefined;
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
