import { and, eq, sql } from "drizzle-orm";
import { tasks, taskNotes } from "../../db/schema";
import { AppError, assertNoConflict, throwIfNotFound } from "../../platform/errors";
import type { Tx } from "../../types/db";
import { countHeadings, countWords, generateExcerpt } from "./note-analysis";

/**
 * Create or replace a task's note. `expectedVersion` (0 = no note yet) and
 * `expectedUpdatedAt` guard against overwriting an edit made elsewhere (409).
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

    const [existing] = await tx
        .select({ id: taskNotes.id, updatedAt: taskNotes.updatedAt, version: taskNotes.version })
        .from(taskNotes)
        .where(and(eq(taskNotes.taskId, taskId), eq(taskNotes.userId, userId)));

    if (guard.expectedVersion !== undefined && guard.expectedVersion !== (existing?.version ?? 0)) {
        throw new AppError(409, "CONFLICT", "Note was modified by another client");
    }

    const analysis = { excerpt: generateExcerpt(body), wordCount: countWords(body), headingCount: countHeadings(body) };

    if (existing) {
        assertNoConflict(guard.expectedUpdatedAt, existing.updatedAt, "Note");
        const [row] = await tx
            .update(taskNotes)
            .set({ body, ...analysis, version: existing.version + 1, updatedAt: sql`NOW()` })
            .where(and(eq(taskNotes.id, existing.id), eq(taskNotes.userId, userId)))
            .returning();
        return row;
    }

    const [row] = await tx.insert(taskNotes).values({ taskId, userId, body, ...analysis }).returning();
    return row;
}
