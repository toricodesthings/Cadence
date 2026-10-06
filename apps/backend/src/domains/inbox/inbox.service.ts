import { and, eq, inArray, sql } from "drizzle-orm";
import { parseCanonicalNlpEnvelope } from "@cadence/nlp";
import type { ProcessInboxItem } from "@cadence/contracts/inbox";
import { isLocalDate } from "@cadence/domain/time";
import { validateTaskRecurrenceRule } from "@cadence/domain/task-recurrence";
import { inboxItems, subtasks, tasks, taskTags } from "../../db/schema";
import { checkIdempotency, recordMutation } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { throwIfNotFound } from "../../platform/errors";
import type { Tx } from "../../types/db";
import { sourceSurfaceSchema } from "@cadence/contracts/task";
import { temporalColumns, toTask, withTagIds } from "../tasks/tasks.service";
import { userZone } from "../../platform/user-zone";
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
    const scheduledDate = body.scheduledDate ?? undefined; // time-legacy: a day or an instant
    const scheduledDay = body.scheduledDay ?? undefined;
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
        const [existing] = await withTagIds(tx, await tx.select().from(tasks).where(and(eq(tasks.id, existingId), eq(tasks.userId, userId))));
        if (existing) return { task: existing, alreadyProcessed: true };
    }

    // Verify inbox item exists and belongs to user
    const [item] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).for("update");
    throwIfNotFound(item, "Inbox item");
    // Already placed (double submit, second device): return that task, never a duplicate.
    if (item.processed && item.placedTaskId) {
        const [placed] = await withTagIds(tx, await tx.select().from(tasks).where(and(eq(tasks.id, item.placedTaskId), eq(tasks.userId, userId))));
        if (placed) return { task: placed, alreadyProcessed: true };
    }

    const zone = await userZone(tx, userId);
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
        clock: nlpRuntime.clock,
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
            // An explicit null stays null: it means "no date", not "not given".
            dueDate: body.dueDate !== undefined ? body.dueDate : scheduledDay ?? (scheduledDate !== undefined && isLocalDate(scheduledDate) ? scheduledDate : undefined),
            scheduledStart: body.scheduledStart !== undefined ? body.scheduledStart : (scheduledDate !== undefined && !isLocalDate(scheduledDate) ? scheduledDate : undefined),
            scheduledEnd,
            isAllDay,
        },
        confidenceThreshold,
        zone,
    );

    // One placement: what the caller sent (a day, or a timed start), else what the parse found.
    const temporalFields = temporalColumns(
        { dueDate: inferred.dueDate, scheduledStart: inferred.scheduledStart, scheduledEnd: inferred.scheduledEnd, isAllDay },
        zone,
        "inbox",
    );

    const taskTagIds = Array.from(new Set(tagIds ?? inferred.tagIds ?? []));
    const taskValues = {
        userId,
        title,
        orderIndex: 0,
        state: body.complete ? "COMPLETE" as const : "ACTIVE" as const,
        origin: body.complete ? "thought" as const : null,
        projectId: "projectId" in body ? body.projectId : inferred.projectId,
        sectionId: body.sectionId ?? null,
        priority: inferred.priority ?? priority ?? 0,
        durationEstimate: inferred.durationEstimate ?? durationEstimate ?? null,
        effort: body.effort ?? null,
        recurrenceRule: inferred.recurrenceRule ?? recurrenceRule ?? null,
        waitingOn: inferred.waitingOn ?? waitingOn ?? null,
        ...temporalFields,
        ...(body.complete ? { dueDate: null, endDate: null, scheduledStart: null, scheduledEnd: null, zone: null, projectId: null, sectionId: null, recurrenceRule: null } : {}),
    };

    validateTaskRecurrenceRule(taskValues.recurrenceRule, taskValues.zone ?? zone);

    await assertOwnership(tx, userId, {
        projectId: taskValues.projectId,
        sectionId: taskValues.sectionId,
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

    return { task: toTask(task, taskTagIds), alreadyProcessed: false };
}

// ── Update ────────────────────────────────────────────────────────────

/**
 * Put a capture back in New (Undo for placing, ticking, keeping or discarding).
 * A task made from it moves to Trash, where it can still be restored.
 */
export async function unprocessCapture(tx: Tx, userId: string, id: string) {
    const [capture] = await tx
        .select()
        .from(inboxItems)
        .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
        .for("update");
    throwIfNotFound(capture, "Inbox item");
    if (capture.placedTaskId) {
        await tx
            .update(tasks)
            .set({ state: "ARCHIVED", updatedAt: sql`NOW()` })
            .where(and(eq(tasks.id, capture.placedTaskId), eq(tasks.userId, userId)));
    }
    const [restored] = await tx
        .update(inboxItems)
        .set({ processed: false, captureStatus: "clarifying", placedTaskId: null })
        .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
        .returning();
    return restored;
}

/** Keep a capture as a note or discard it (both restorable), and/or change its words. */
export async function updateCapture(
    tx: Tx,
    userId: string,
    id: string,
    change: { rawText?: string; captureStatus?: "kept" | "discarded" },
) {
    const [row] = await tx
        .update(inboxItems)
        .set(change)
        .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
        .returning();
    throwIfNotFound(row, "Inbox item");
    return row;
}

// ── Delete ────────────────────────────────────────────────────────────

/** Delete captures for good. Tasks made from them stay. Unknown ids are skipped. */
export async function deleteCaptures(tx: Tx, userId: string, ids: string[]) {
    return tx
        .delete(inboxItems)
        .where(and(eq(inboxItems.userId, userId), inArray(inboxItems.id, ids)))
        .returning({ id: inboxItems.id });
}
