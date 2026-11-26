import { OPEN_TASK_STATES } from "@cadence/contracts/task";
import { and, eq, inArray, notExists } from "drizzle-orm";
import { foldName, tagsForPlace } from "@cadence/domain/auto-tag";
import { projects, tags, taskSections, tasks, taskTags, users } from "../../db/schema";
import { throwIfNotFound } from "../../platform/errors";
import { assertOwnership, assertTaskOwnership } from "../../platform/ownership";
import type { Tx } from "../../types/db";

export type Place = { projectId?: string | null; sectionId?: string | null };

export async function autoTagOn(tx: Tx, userId: string): Promise<boolean> {
    const [user] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    return user?.settings?.tasks?.autoTag !== false;
}

const userTags = (tx: Tx, userId: string) =>
    tx.select({ id: tags.id, name: tags.name, sortOrder: tags.sortOrder }).from(tags).where(eq(tags.userId, userId));

async function placeNames(tx: Tx, userId: string, { projectId, sectionId }: Place) {
    const [list] = projectId
        ? await tx
              .select({ name: projects.name })
              .from(projects)
              .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
        : [];
    const [section] = sectionId
        ? await tx
              .select({ name: taskSections.name })
              .from(taskSections)
              .where(and(eq(taskSections.id, sectionId), eq(taskSections.userId, userId)))
        : [];
    return [list?.name, section?.name];
}

export async function placeTagIds(tx: Tx, userId: string, place: Place): Promise<string[]> {
    if (!place.projectId || !(await autoTagOn(tx, userId))) return [];
    return tagsForPlace(await placeNames(tx, userId, place), await userTags(tx, userId));
}

export async function retagForMove(tx: Tx, userId: string, taskId: string, from: Place, to: Place) {
    if (from.projectId === to.projectId && from.sectionId === to.sectionId) return;
    if (!(await autoTagOn(tx, userId))) return;
    const all = await userTags(tx, userId);
    const fromIds = from.projectId ? tagsForPlace(await placeNames(tx, userId, from), all) : [];
    const toIds = to.projectId ? tagsForPlace(await placeNames(tx, userId, to), all) : [];
    const gone = fromIds.filter((id) => !toIds.includes(id));
    if (gone.length) await tx.delete(taskTags).where(and(eq(taskTags.taskId, taskId), inArray(taskTags.tagId, gone)));
    if (toIds.length)
        await tx
            .insert(taskTags)
            .values(toIds.map((tagId) => ({ taskId, tagId })))
            .onConflictDoNothing();
}

export async function placeMatches(tx: Tx, userId: string, tagId: string) {
    const [tag] = await tx
        .select({ name: tags.name })
        .from(tags)
        .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
    throwIfNotFound(tag, "Tag");
    const key = (await autoTagOn(tx, userId)) ? foldName(tag.name) : "";
    if (!key) return { places: [], taskIds: [] as string[] };
    const [lists, sections] = await Promise.all([
        tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId)),
        tx
            .select({ id: taskSections.id, name: taskSections.name })
            .from(taskSections)
            .where(eq(taskSections.userId, userId)),
    ]);
    const lis = lists.filter((l) => foldName(l.name) === key);
    const sec = sections.filter((s) => foldName(s.name) === key);
    const places = [
        ...lis.map((l) => ({ kind: "list" as const, name: l.name })),
        ...sec.map((s) => ({ kind: "section" as const, name: s.name })),
    ];
    if (!places.length) return { places, taskIds: [] as string[] };
    const rows = await tx
        .select({ id: tasks.id, projectId: tasks.projectId, sectionId: tasks.sectionId })
        .from(tasks)
        .where(
            and(
                eq(tasks.userId, userId),
                inArray(tasks.state, OPEN_TASK_STATES),
                notExists(
                    tx
                        .select({ one: taskTags.id })
                        .from(taskTags)
                        .where(and(eq(taskTags.taskId, tasks.id), eq(taskTags.tagId, tagId))),
                ),
            ),
        );
    const listIds = new Set(lis.map((l) => l.id));
    const sectionIds = new Set(sec.map((s) => s.id));
    const taskIds = rows
        .filter((t) => (t.projectId && listIds.has(t.projectId)) || (t.sectionId && sectionIds.has(t.sectionId)))
        .map((t) => t.id);
    return { places, taskIds };
}

export async function linkTag(tx: Tx, userId: string, tagId: string, taskIds: string[], linked: boolean) {
    await assertOwnership(tx, userId, { tagIds: [tagId] });
    await Promise.all(taskIds.map((id) => assertTaskOwnership(tx, userId, id)));
    if (linked) {
        const rows = await tx
            .insert(taskTags)
            .values(taskIds.map((taskId) => ({ taskId, tagId })))
            .onConflictDoNothing()
            .returning({ taskId: taskTags.taskId });
        return rows.map((r) => r.taskId);
    }
    const rows = await tx
        .delete(taskTags)
        .where(and(eq(taskTags.tagId, tagId), inArray(taskTags.taskId, taskIds)))
        .returning({ taskId: taskTags.taskId });
    return rows.map((r) => r.taskId);
}
