import { and, eq } from "drizzle-orm";
import { parseCanonicalNlpEnvelope } from "@cadence/nlp";
import type { ProcessInboxItem } from "@cadence/contracts/inbox";
import { normalizeTaskTemporalFields } from "@cadence/domain/task-temporal";
import { validateTaskRecurrenceRule } from "@cadence/domain/task-recurrence";
import { inboxItems, subtasks, tasks, taskTags } from "../../db/schema";
import { checkIdempotency, recordMutation } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { throwIfNotFound } from "../../platform/errors";
import type { Tx } from "../../types/db";
import { sourceSurfaceSchema } from "@cadence/contracts/task";
import { isDateOnly } from "@cadence/contracts/common";
import { loadNlpRuntime, inferTaskFieldsFromParse, persistNlpSnapshot } from "../tasks/task-nlp";
import { writeNote } from "../notes/notes.service";

/**
 * Turn a capture into a task in one transaction: the task, its tags, checklist
 * steps and note, and the capture marked placed (never deleted). A replayed key
 * or an already placed capture returns that task instead of a second one.
 */
export async function processCapture(
    tx: Tx,
    userId: string,
    id: string,
    body: ProcessInboxItem,
    extras: { idempotencyKey?: string; subtasks?: string[]; note?: string } = {},
) {
    const idempotencyKey = extras.idempotencyKey;
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

    // Idempotency guard
    const existingId = await checkIdempotency(tx, userId, idempotencyKey);
    if (existingId) {
        const [existing] = await tx.select().from(tasks).where(and(eq(tasks.id, existingId), eq(tasks.userId, userId)));
        if (existing) return { task: existing, alreadyProcessed: true };
    }

    // Verify inbox item exists and belongs to user
    const [item] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).for("update");
    throwIfNotFound(item, "Inbox item");
    // Already placed (double submit, second device): return that task, never a duplicate.
    if (item.processed && item.placedTaskId) {
        const [placed] = await tx.select().from(tasks).where(and(eq(tasks.id, item.placedTaskId), eq(tasks.userId, userId)));
        if (placed) return { task: placed, alreadyProcessed: true };
    }

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
        "dueDate" in body
        || "scheduledStart" in body
        || "scheduledEnd" in body
        || "isAllDay" in body
    ) {
        temporalFields = normalizeTaskTemporalFields({
            dueDate,
            scheduledStart,
            scheduledEnd,
            isAllDay: isAllDay ?? (scheduledStart ? false : true),
        });
    } else if (scheduledDate !== undefined) {
        if (isDateOnly(scheduledDate)) {
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
        if (isDateOnly(inferred.scheduledDate)) {
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

    const taskTagIds = Array.from(new Set(tagIds ?? inferred.tagIds ?? []));
    const taskValues = {
        userId,
        title,
        orderIndex: 0,
        state: body.complete ? "COMPLETE" as const : "ACTIVE" as const,
        origin: body.complete ? "thought" as const : null,
        projectId: "projectId" in body ? body.projectId : inferred.projectId,
        priority: inferred.priority ?? priority ?? 0,
        durationEstimate: inferred.durationEstimate ?? durationEstimate ?? null,
        effort: body.effort ?? null,
        recurrenceRule: inferred.recurrenceRule ?? recurrenceRule ?? null,
        waitingOn: inferred.waitingOn ?? waitingOn ?? null,
        ...temporalFields,
        ...(body.complete ? { dueDate: null, scheduledStart: null, scheduledEnd: null, isAllDay: true, projectId: null, recurrenceRule: null } : {}),
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

    if (extras.subtasks?.length) {
        await tx.insert(subtasks).values(extras.subtasks.map((title, orderIndex) => ({ taskId: task.id, userId, title, orderIndex })));
    }
    if (extras.note) await writeNote(tx, userId, task.id, extras.note, { expectedVersion: 0 });

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
}
