import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { InsertProject, UpdateProject } from "@cadence/contracts/project";
import { projects, tasks } from "../../db/schema";
import { throwIfNotFound } from "../../platform/errors";
import { checkIdempotency, insertWithClientId, recordMutation } from "../../platform/idempotency";
import type { Tx } from "../../types/db";

/** Create a project. A replayed idempotency key returns the first one. */
export async function createProject(tx: Tx, userId: string, body: InsertProject, idempotencyKey?: string) {
    const existingId = await checkIdempotency(tx, userId, idempotencyKey);
    if (existingId) {
        const [existing] = await tx.select().from(projects).where(and(eq(projects.id, existingId), eq(projects.userId, userId)));
        if (existing) return existing;
    }

    const [row] = await insertWithClientId(() => tx
        .insert(projects)
        .values({ ...body, userId })
        .returning());

    await recordMutation(tx, userId, idempotencyKey, row.id);
    return row;
}

/** Rename a project or change its emoji/colour. 404 when it isn't the caller's. */
export async function updateProject(tx: Tx, userId: string, id: string, body: UpdateProject) {
    const [row] = await tx
        .update(projects)
        .set(body)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .returning();
    throwIfNotFound(row, "Project");
    return row;
}

/**
 * Delete a project for good; its sections go with it. Its tasks stay, with no
 * list, unless `trashOpenTasks` moves the open ones to Trash first.
 */
export async function deleteProject(tx: Tx, userId: string, id: string, { trashOpenTasks = false } = {}) {
    const trashed = trashOpenTasks
        ? await tx
              .update(tasks)
              .set({ state: "ARCHIVED", updatedAt: sql`NOW()` })
              .where(and(eq(tasks.userId, userId), eq(tasks.projectId, id), inArray(tasks.state, ["ACTIVE", "WAITING"])))
              .returning({ id: tasks.id })
        : [];
    const [{ kept }] = await tx
        .select({ kept: count() })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.projectId, id), ne(tasks.state, "ARCHIVED")));
    // The foreign key clears each task's list and deletes the list's sections.
    const [row] = await tx
        .delete(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .returning();
    throwIfNotFound(row, "Project");
    return { project: row, tasksTrashed: trashed.length, tasksUnlisted: kept };
}
