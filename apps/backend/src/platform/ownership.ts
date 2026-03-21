import { eq, and, inArray } from "drizzle-orm";
import { projects, tags, taskSections } from "../db/schema";
import { AppError } from "./errors";
import type { DbClient } from "./db";

/** Transaction type extracted from withRls callback parameter */
type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

/**
 * Verify that a project belongs to the given user.
 * Throws 403 if the project exists but belongs to another user.
 * Throws 404 if the project does not exist.
 */
export async function assertProjectOwnership(tx: Tx, userId: string, projectId: string) {
    const [row] = await tx
        .select({ userId: projects.userId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
    if (!row) throw new AppError(404, "NOT_FOUND", "Project not found");
    if (row.userId !== userId) throw new AppError(403, "FORBIDDEN", "Project belongs to another user");
}

/**
 * Verify that a section belongs to the given user.
 * Throws 403 if the section belongs to another user.
 * Throws 404 if the section does not exist.
 */
export async function assertSectionOwnership(tx: Tx, userId: string, sectionId: string) {
    const [row] = await tx
        .select({ userId: taskSections.userId })
        .from(taskSections)
        .where(eq(taskSections.id, sectionId))
        .limit(1);
    if (!row) throw new AppError(404, "NOT_FOUND", "Section not found");
    if (row.userId !== userId) throw new AppError(403, "FORBIDDEN", "Section belongs to another user");
}

/**
 * Verify that all tag IDs belong to the given user.
 * Throws 403 if any tag belongs to another user.
 * Throws 404 if any tag does not exist.
 */
export async function assertTagsOwnership(tx: Tx, userId: string, tagIds: string[]) {
    if (tagIds.length === 0) return;
    const uniqueIds = [...new Set(tagIds)];
    const rows = await tx
        .select({ id: tags.id, userId: tags.userId })
        .from(tags)
        .where(inArray(tags.id, uniqueIds));
    if (rows.length !== uniqueIds.length) {
        throw new AppError(404, "NOT_FOUND", "One or more tags not found");
    }
    if (rows.some((r) => r.userId !== userId)) {
        throw new AppError(403, "FORBIDDEN", "One or more tags belong to another user");
    }
}

/**
 * Validate all cross-entity references in a single call.
 * Skips any reference that is null/undefined.
 */
export async function assertOwnership(
    tx: Tx,
    userId: string,
    refs: { projectId?: string | null; sectionId?: string | null; tagIds?: string[] },
) {
    const checks: Promise<void>[] = [];
    if (refs.projectId) checks.push(assertProjectOwnership(tx, userId, refs.projectId));
    if (refs.sectionId) checks.push(assertSectionOwnership(tx, userId, refs.sectionId));
    if (refs.tagIds?.length) checks.push(assertTagsOwnership(tx, userId, refs.tagIds));
    await Promise.all(checks);
}
