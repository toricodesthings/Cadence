import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { parseCanonicalNlpEnvelope } from "@cadence/nlp";
import { suggestedEffortSchema, type ProcessInboxItem } from "@cadence/contracts/inbox";
import { validateTaskRecurrenceRule } from "@cadence/domain/task-recurrence";
import { inboxItems, subtasks, tasks, taskTags } from "../../db/schema";
import { checkIdempotency, insertWithClientId, recordMutation } from "../../platform/idempotency";
import { assertOwnership } from "../../platform/ownership";
import { assertListRoom, listAccess, requireEdit, taskAccess, type ListAccess } from "../../platform/list-access";
import { AppError, throwIfNotFound } from "../../platform/errors";
import type { Tx } from "../../types/db";
import { sourceSurfaceSchema } from "@cadence/contracts/task";
import {
    effortProvenance,
    overlayPersonalReminders,
    temporalColumns,
    toTask,
    upsertPersonalReminder,
    withTagIds,
} from "../tasks/tasks.service";
import { userZone } from "../../platform/user-zone";
import type { Zone } from "@cadence/domain/time";
import { loadNlpRuntime, inferTaskFieldsFromParse, persistNlpSnapshot } from "../tasks/task-nlp";
import { writeNote } from "../notes/notes.service";
import { placeTagIds } from "../tags/tags.service";
import { assertRowRoom } from "../../platform/storage-ceiling";

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
    if (replayed) return { task: replayed, broadcast: undefined, access: null, alreadyProcessed: true };

    const [item] = await tx
        .select()
        .from(inboxItems)
        .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
        .for("update");
    throwIfNotFound(item, "Inbox item");
    const placed = item.processed && item.placedTaskId ? await findTask(tx, userId, item.placedTaskId) : undefined;
    if (placed) return { task: placed, broadcast: undefined, access: null, alreadyProcessed: true };

    const zone = await userZone(tx, userId);
    const { parsed, inferred } = await inferPlacement(tx, userId, item, body, zone);

    const values = captureTaskValues(userId, body, inferred, zone);
    const taskValues = {
        ...values,
        ...(values.effort == null && !values.recurrenceRule && effortGuessFromCapture(item.analysis)),
    };
    const taskTagIds = Array.from(new Set([...inferred.tagIds, ...(await placeTagIds(tx, userId, taskValues))]));

    validateTaskRecurrenceRule(taskValues.recurrenceRule, taskValues.zone ?? zone);

    const destAccess: ListAccess | null = taskValues.projectId
        ? await listAccess(tx, userId, taskValues.projectId)
        : null;
    if (destAccess) {
        requireEdit(destAccess);
        await assertListRoom(tx, destAccess.listId);
    }
    const ownerId = destAccess?.ownerId ?? userId;
    const guest = ownerId !== userId;
    const isSharedDest = Boolean(destAccess && destAccess.audience.length > 1);

    await assertOwnership(tx, ownerId, {
        projectId: taskValues.sectionId ? (taskValues.projectId ?? null) : taskValues.projectId,
        sectionId: taskValues.sectionId,
    });
    if (taskTagIds.length > 0) {
        await assertOwnership(tx, userId, { tagIds: taskTagIds });
    }

    if (!guest) await assertRowRoom(tx, userId, "tasks");
    const insertValues = {
        ...taskValues,
        userId: ownerId,
        createdBy: userId,
        ...(guest ? { reminderAt: null } : {}),
    };
    const [task] = await insertWithClientId(() =>
        tx
            .insert(tasks)
            .values(body.taskId ? { ...insertValues, id: body.taskId } : insertValues)
            .returning(),
    );

    if (guest && taskValues.reminderAt) {
        await upsertPersonalReminder(tx, userId, task.id, { reminderAt: taskValues.reminderAt });
    }

    if (taskTagIds.length > 0) {
        await tx.insert(taskTags).values(taskTagIds.map((tagId) => ({ taskId: task.id, tagId })));
    }

    if (!isSharedDest) {
        await persistNlpSnapshot(tx, parsed, task.id, userId);
    }

    if (extras.subtasks?.length) {
        await tx
            .insert(subtasks)
            .values(
                extras.subtasks.map((title, orderIndex) => ({ taskId: task.id, userId: ownerId, title, orderIndex })),
            );
    }
    if (extras.note) await writeNote(tx, ownerId, task.id, extras.note, { expectedVersion: 0 });

    await tx
        .update(inboxItems)
        .set({
            captureStatus: "placed",
            placedTaskId: task.id,
            processed: true,
            analysisStatus: "applied",
            analysisVersion: parsed.parserVersion,
            analysisSummary: parsed.summary,
            analysis: {
                ...(parsed as unknown as Record<string, unknown>),
                ...(item.analysis?.suggestedPlacement ? { suggestedPlacement: item.analysis.suggestedPlacement } : {}),
                ...(item.analysis?.suggestedPriority ? { suggestedPriority: item.analysis.suggestedPriority } : {}),
                ...(item.analysis?.suggestedEffort ? { suggestedEffort: item.analysis.suggestedEffort } : {}),
            },
            sourceSurface: parsed.sourceSurface,
        })
        .where(eq(inboxItems.id, id));

    await recordMutation(tx, userId, idempotencyKey, task.id);

    const broadcast = toTask(task, taskTagIds);
    const [callerRow] = guest && taskValues.reminderAt ? await overlayPersonalReminders(tx, userId, [task]) : [task];
    const callerTask = callerRow === task ? broadcast : toTask(callerRow, taskTagIds);
    return { task: callerTask, broadcast, access: destAccess, alreadyProcessed: false };
}

function effortGuessFromCapture(analysis: unknown) {
    const parsed = suggestedEffortSchema.safeParse((analysis as { suggestedEffort?: unknown } | null)?.suggestedEffort);
    return parsed.success
        ? {
              effortGuess: parsed.data.effort,
              effortGuessSource: "model" as const,
              effortGuessAt: new Date().toISOString(),
          }
        : {};
}

const PLACED_NOWHERE = {
    dueDate: null,
    endDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    zone: null,
    projectId: null,
    sectionId: null,
    recurrenceRule: null,
};

function captureTaskValues(
    userId: string,
    body: ProcessInboxItem,
    inferred: Awaited<ReturnType<typeof inferPlacement>>["inferred"],
    zone: Zone,
) {
    const temporalFields = temporalColumns(
        {
            dueDate: inferred.dueDate,
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
        state: waitingOn ? ("WAITING" as const) : ("ACTIVE" as const),
        origin: null,
        projectId: "projectId" in body ? body.projectId : inferred.projectId,
        sectionId,
        priority: inferred.priority ?? 0,
        durationEstimate: inferred.durationEstimate ?? null,
        effort,
        ...effortProvenance(effort, body.effortOrigin),
        recurrenceRule: inferred.recurrenceRule ?? null,
        waitingOn,
        reminderAt,
        notBefore,
        ...temporalFields,
    };
    return body.complete
        ? { ...values, state: "COMPLETE" as const, origin: "thought" as const, ...PLACED_NOWHERE }
        : values;
}

async function findTask(tx: Tx, userId: string, taskId: string) {
    const rows = await tx.select().from(tasks).where(eq(tasks.id, taskId));
    const [task] = await withTagIds(tx, await overlayPersonalReminders(tx, userId, rows));
    return task;
}

const unset = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

function explicitFields(body: ProcessInboxItem) {
    return {
        projectId: unset(body.projectId),
        tagIds: unset(body.tagIds),
        priority: unset(body.priority),
        durationEstimate: unset(body.durationEstimate),
        waitingOn: unset(body.waitingOn),
        recurrenceRule: unset(body.recurrenceRule),
        dueDate: body.dueDate !== undefined ? body.dueDate : unset(body.scheduledDay),
        scheduledStart: body.scheduledStart,
        scheduledEnd: unset(body.scheduledEnd),
    };
}

function asResolved(explicit: ReturnType<typeof explicitFields>) {
    return {
        ...explicit,
        tagIds: explicit.tagIds ?? [],
        dueDate: explicit.dueDate ?? null,
        scheduledStart: explicit.scheduledStart ?? null,
        scheduledEnd: explicit.scheduledEnd ?? null,
    };
}

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
    const inferred = body.nlp?.resolved ? asResolved(explicit) : inferTaskFieldsFromParse(parsed, explicit, zone);
    return { parsed, inferred };
}

export async function unprocessCapture(tx: Tx, userId: string, id: string) {
    const [capture] = await tx
        .select()
        .from(inboxItems)
        .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
        .for("update");
    throwIfNotFound(capture, "Inbox item");
    if (capture.placedTaskId) {
        const access = await taskAccess(tx, userId, capture.placedTaskId);
        if (access) requireEdit(access);
        const ownerId = access?.ownerId ?? userId;
        await tx
            .update(tasks)
            .set({ state: "ARCHIVED", updatedAt: sql`NOW()` })
            .where(and(eq(tasks.id, capture.placedTaskId), eq(tasks.userId, ownerId)));
    }
    const [restored] = await tx
        .update(inboxItems)
        .set({ processed: false, captureStatus: "clarifying", placedTaskId: null })
        .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)))
        .returning();
    return restored;
}

export async function updateCapture(
    tx: Tx,
    userId: string,
    id: string,
    change: { rawText?: string; captureStatus?: "kept" | "discarded" },
) {
    const [row] = await tx
        .update(inboxItems)
        .set(change)
        .where(
            and(
                eq(inboxItems.id, id),
                eq(inboxItems.userId, userId),
                change.captureStatus ? isNull(inboxItems.placedTaskId) : undefined,
            ),
        )
        .returning();
    if (!row && change.captureStatus) {
        const [exists] = await tx
            .select({ id: inboxItems.id })
            .from(inboxItems)
            .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId)));
        if (exists) throw new AppError(409, "CONFLICT", "This capture was already placed");
    }
    throwIfNotFound(row, "Inbox item");
    return row;
}

export async function deleteCaptures(tx: Tx, userId: string, ids: string[]) {
    return tx
        .delete(inboxItems)
        .where(and(eq(inboxItems.userId, userId), inArray(inboxItems.id, ids)))
        .returning({ id: inboxItems.id });
}
