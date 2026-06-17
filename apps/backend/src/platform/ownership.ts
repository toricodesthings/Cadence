import { eq, and, inArray } from "drizzle-orm";
import { projects, tags, taskSections } from "../db/schema";
import { AppError } from "./errors";
import type { Tx } from "../types/db";

/**
 * Verify that a single-row entity (keyed by `id`, owned via `userId`) belongs
 * to the given user. Throws 404 if it does not exist, 403 if it belongs to
 * another user. `label` names the entity in the error message.
 */
async function assertRowOwnership(
    tx: Tx,
    table: typeof projects | typeof taskSections,
    userId: string,
    id: string,
    label: string,
) {
    const [row] = await tx
        .select({ userId: table.userId })
        .from(table)
        .where(eq(table.id, id))
        .limit(1);
    if (!row) throw new AppError(404, "NOT_FOUND", `${label} not found`);
    if (row.userId !== userId) throw new AppError(403, "FORBIDDEN", `${label} belongs to another user`);
}

/**
 * Verify that a project belongs to the given user.
 * Throws 403 if the project exists but belongs to another user.
 * Throws 404 if the project does not exist.
 */
export async function assertProjectOwnership(tx: Tx, userId: string, projectId: string) {
    await assertRowOwnership(tx, projects, userId, projectId, "Project");
}

/**
 * Verify that a section belongs to the given user.
 * Throws 403 if the section belongs to another user.
 * Throws 404 if the section does not exist.
 */
export async function assertSectionOwnership(tx: Tx, userId: string, sectionId: string) {
    await assertRowOwnership(tx, taskSections, userId, sectionId, "Section");
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
