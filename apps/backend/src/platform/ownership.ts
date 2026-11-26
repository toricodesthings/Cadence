import { and, eq, inArray } from "drizzle-orm";
import { inboxSections, projects, tags, taskSections, tasks } from "../db/schema";
import { AppError, throwIfNotFound } from "./errors";
import type { Tx } from "../types/db";

async function assertRowOwnership(
    tx: Tx,
    table: typeof projects | typeof taskSections | typeof inboxSections,
    userId: string,
    id: string,
    label: string,
) {
    const [row] = await tx.select({ userId: table.userId }).from(table).where(eq(table.id, id)).limit(1);
    if (!row) throw new AppError(404, "NOT_FOUND", `${label} not found`);
    if (row.userId !== userId) throw new AppError(403, "FORBIDDEN", `${label} belongs to another user`);
}

export async function assertProjectOwnership(tx: Tx, userId: string, projectId: string) {
    await assertRowOwnership(tx, projects, userId, projectId, "Project");
}

async function assertSectionOwnership(tx: Tx, userId: string, sectionId: string, projectId?: string | null) {
    const [row] = await tx
        .select({ userId: taskSections.userId, projectId: taskSections.projectId })
        .from(taskSections)
        .where(eq(taskSections.id, sectionId))
        .limit(1);
    if (!row) throw new AppError(404, "NOT_FOUND", "Section not found");
    if (row.userId !== userId) throw new AppError(403, "FORBIDDEN", "Section belongs to another user");
    if (projectId !== undefined && row.projectId !== projectId) {
        throw new AppError(400, "INVALID_SECTION", "Section does not belong to the selected list");
    }
}

async function assertTagsOwnership(tx: Tx, userId: string, tagIds: string[]) {
    if (tagIds.length === 0) return;
    const uniqueIds = [...new Set(tagIds)];
    const rows = await tx.select({ id: tags.id, userId: tags.userId }).from(tags).where(inArray(tags.id, uniqueIds));
    if (rows.length !== uniqueIds.length) {
        throw new AppError(404, "NOT_FOUND", "One or more tags not found");
    }
    if (rows.some((r) => r.userId !== userId)) {
        throw new AppError(403, "FORBIDDEN", "One or more tags belong to another user");
    }
}

export async function assertOwnership(
    tx: Tx,
    userId: string,
    refs: { projectId?: string | null; sectionId?: string | null; inboxSectionId?: string | null; tagIds?: string[] },
) {
    const checks: Promise<void>[] = [];
    if (refs.projectId) checks.push(assertProjectOwnership(tx, userId, refs.projectId));
    if (refs.sectionId) checks.push(assertSectionOwnership(tx, userId, refs.sectionId, refs.projectId));
    if (refs.inboxSectionId)
        checks.push(assertRowOwnership(tx, inboxSections, userId, refs.inboxSectionId, "Inbox section"));
    if (refs.tagIds?.length) checks.push(assertTagsOwnership(tx, userId, refs.tagIds));
    await Promise.all(checks);
}

export async function assertTaskOwnership(tx: Tx, userId: string, taskId: string) {
    const [task] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    throwIfNotFound(task, "Task");
}
