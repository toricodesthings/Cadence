import { and, eq, inArray, sql } from "drizzle-orm";
import { parseCanonicalNlpEnvelope } from "@cadence/nlp";
import type { ProcessInboxItem } from "@cadence/contracts/inbox";
import { validateTaskRecurrenceRule } from "@cadence/domain/task-recurrence";
import { inboxItems, subtasks, tasks, taskTags } from "../../db/schema";
import { checkIdempotency, recordMutation } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { throwIfNotFound } from "../../platform/errors";
import type { Tx } from "../../types/db";
import { sourceSurfaceSchema } from "@cadence/contracts/task";
import { temporalColumns, toTask, withTagIds } from "../tasks/tasks.service";
import { userZone } from "../../platform/user-zone";
import type { Zone } from "@cadence/domain/time";
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
    const { idempotencyKey } = extras;
    const existingId = await checkIdempotency(tx, userId, idempotencyKey);
    const replayed = existingId ? await findTask(tx, userId, existingId) : undefined;
    if (replayed) return { task: replayed, alreadyProcessed: true };

    const [item] = await tx.select().from(inboxItems).where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId))).for("update");
    throwIfNotFound(item, "Inbox item");
    // Already placed (double submit, second device): return that task, never a duplicate.
    const placed = item.processed && item.placedTaskId ? await findTask(tx, userId, item.placedTaskId) : undefined;
    if (placed) return { task: placed, alreadyProcessed: true };

    const zone = await userZone(tx, userId);
    const { parsed, inferred } = await inferPlacement(tx, userId, item, body, zone);

    const taskValues = captureTaskValues(userId, body, inferred, zone);
    const taskTagIds = Array.from(new Set(inferred.tagIds));

    validateTaskRecurrenceRule(taskValues.recurrenceRule, taskValues.zone ?? zone);

    await assertOwnership(tx, userId, {
        // A section with no list can't match: reject it rather than drop it silently.
        projectId: taskValues.sectionId ? (taskValues.projectId ?? null) : taskValues.projectId,
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
            // Kept after placing: Admin reads whether the suggestion was accepted, and what it cost, from here.
            analysis: {
                ...(parsed as unknown as Record<string, unknown>),
                ...(item.analysis?.suggestedPlacement ? { suggestedPlacement: item.analysis.suggestedPlacement } : {}),
            },
            sourceSurface: parsed.sourceSurface,
        })
        .where(eq(inboxItems.id, id));

    await recordMutation(tx, userId, idempotencyKey, task.id);

    return { task: toTask(task, taskTagIds), alreadyProcessed: false };
}

/** Where a ticked-off thought goes: nowhere. */
const PLACED_NOWHERE = { dueDate: null, endDate: null, scheduledStart: null, scheduledEnd: null, zone: null, projectId: null, sectionId: null, recurrenceRule: null };

/** The task row a capture becomes. A ticked-off thought is done and placed nowhere. */
function captureTaskValues(
    userId: string,
    body: ProcessInboxItem,
    inferred: Awaited<ReturnType<typeof inferPlacement>>["inferred"],
    zone: Zone,
) {
    // One placement: what the caller sent (a day, or a timed start), else what the parse found.
    const temporalFields = temporalColumns(
        {
            dueDate: inferred.dueDate,
            // A span's last day belongs to the day it was picked with; a different (inferred) day drops it.
            endDate: body.endDate && inferred.dueDate === body.dueDate ? body.endDate : null,
            scheduledStart: inferred.scheduledStart,
            scheduledEnd: inferred.scheduledEnd,
        },
        zone,
    );

    const waitingOn = inferred.waitingOn ?? null;
    const { sectionId = null, effort = null, reminderAt = null, notBefore = null } = body;
    const values = {
        userId,
        title: body.title,
        orderIndex: 0,
        // Waiting on someone is a state, not just a note: the task shows who only while WAITING.
        state: waitingOn ? "WAITING" as const : "ACTIVE" as const,
        origin: null,
        projectId: "projectId" in body ? body.projectId : inferred.projectId,
        sectionId,
        priority: inferred.priority ?? 0,
        durationEstimate: inferred.durationEstimate ?? null,
        effort,
        recurrenceRule: inferred.recurrenceRule ?? null,
        waitingOn,
        reminderAt,
        notBefore,
        ...temporalFields,
    };
    return body.complete ? { ...values, state: "COMPLETE" as const, origin: "thought" as const, ...PLACED_NOWHERE } : values;
}

async function findTask(tx: Tx, userId: string, taskId: string) {
    const [task] = await withTagIds(tx, await tx.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))));
    return task;
}

const unset = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

/** The fields the caller sent; unsent (or null) ones are undefined. */
function explicitFields(body: ProcessInboxItem) {
    return {
        projectId: unset(body.projectId),
        tagIds: unset(body.tagIds),
        priority: unset(body.priority),
        durationEstimate: unset(body.durationEstimate),
        waitingOn: unset(body.waitingOn),
        recurrenceRule: unset(body.recurrenceRule),
        // An explicit null stays null: it means "no date", not "not given".
        dueDate: body.dueDate !== undefined ? body.dueDate : unset(body.scheduledDay),
        scheduledStart: body.scheduledStart,
        scheduledEnd: unset(body.scheduledEnd),
    };
}

/** Fields the client resolved itself: an absent one is "none". */
function asResolved(explicit: ReturnType<typeof explicitFields>) {
    return {
        ...explicit,
        tagIds: explicit.tagIds ?? [],
        dueDate: explicit.dueDate ?? null,
        scheduledStart: explicit.scheduledStart ?? null,
        scheduledEnd: explicit.scheduledEnd ?? null,
    };
}

/** The capture's fields: what the caller sent, else what its words say. */
async function inferPlacement(
    tx: Tx,
    userId: string,
    item: Pick<typeof inboxItems.$inferSelect, "rawText" | "sourceSurface">,
    body: ProcessInboxItem,
    zone: Zone,
) {
    const nlpRuntime = await loadNlpRuntime(tx, userId);
    const { settings } = nlpRuntime;
    const envelope = body.nlp ?? {
        rawInput: item.rawText,
        sourceSurface: sourceSurfaceSchema.parse(item.sourceSurface ?? "inbox"),
        dateStyle: (settings.dateTime?.dateStyle ?? "mdy") as "mdy" | "dmy" | "ymd",
        dismissedEntityIds: Array.from(nlpRuntime.dismissedEntityIds),
        userOverrides: {},
    };
    const parsed = parseCanonicalNlpEnvelope(envelope, { context: nlpRuntime.context, clock: nlpRuntime.clock });
    const explicit = explicitFields(body);
    // `resolved`: the client chose every field; store them as sent (an absent one is "none") and never re-read the words.
    const inferred = body.nlp?.resolved
        ? asResolved(explicit)
        : inferTaskFieldsFromParse(
            parsed,
            explicit,
            (settings.tasks?.intelligence?.confidenceThreshold ?? "medium") as "high" | "medium" | "low",
            zone,
        );
    return { parsed, inferred };
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
