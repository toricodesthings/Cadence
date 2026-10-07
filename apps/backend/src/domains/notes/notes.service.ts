import { and, eq, sql } from "drizzle-orm";
import { tasks, taskNotes } from "../../db/schema";
import { AppError, assertNoConflict, throwIfNotFound } from "../../platform/errors";
import type { Tx } from "../../types/db";
import { countHeadings, countWords, generateExcerpt } from "./note-analysis";

const conflict = () => new AppError(409, "CONFLICT", "Note was modified by another client");

/**
 * Create or replace a task's note. `expectedVersion` (0 = no note yet) and
 * `expectedUpdatedAt` guard against overwriting an edit made elsewhere (409).
 * Writers of one note are serialized for the rest of the transaction, so the
 * guard and the write can't be split by a concurrent request. A body equal to
 * the stored one passes the guard but changes nothing (no new revision).
 */
export async function writeNote(
    tx: Tx,
    userId: string,
    taskId: string,
    body: string,
    guard: { expectedVersion?: number; expectedUpdatedAt?: string } = {},
) {
    const [parent] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    throwIfNotFound(parent, "Task");

    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`note:${userId}:${taskId}`}, 0))`);

    const [existing] = await tx
        .select()
        .from(taskNotes)
        .where(and(eq(taskNotes.taskId, taskId), eq(taskNotes.userId, userId)));

    if (guard.expectedVersion !== undefined) {
        if (guard.expectedVersion !== (existing?.version ?? 0)) throw conflict();
    } else if (existing) {
        assertNoConflict(guard.expectedUpdatedAt, existing.updatedAt, "Note");
    }

    if (existing?.body === body) return existing;

    const analysis = { excerpt: generateExcerpt(body), wordCount: countWords(body), headingCount: countHeadings(body) };

    if (existing) {
        const [row] = await tx
            .update(taskNotes)
            .set({ body, ...analysis, version: existing.version + 1, updatedAt: sql`NOW()` })
            .where(and(eq(taskNotes.id, existing.id), eq(taskNotes.userId, userId), eq(taskNotes.version, existing.version)))
            .returning();
        if (!row) throw conflict();
        return row;
    }

    // The unique task index is the last word on concurrent first writes.
    const [row] = await tx.insert(taskNotes).values({ taskId, userId, body, ...analysis }).onConflictDoNothing().returning();
    if (!row) throw conflict();
    return row;
}
