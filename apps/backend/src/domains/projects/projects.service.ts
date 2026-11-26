import { OPEN_TASK_STATES } from "@cadence/contracts/task";
import { and, count, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { InsertProject, UpdateProject } from "@cadence/contracts/project";
import type { Project } from "@cadence/contracts/project";
import { listMembers, projects, tasks } from "../../db/schema";
import { memberView } from "../../db/schema/columns";
import { throwIfNotFound } from "../../platform/errors";
import { createOnce } from "../../platform/idempotency";
import type { Tx } from "../../types/db";
import { assertRowRoom } from "../../platform/storage-ceiling";

export async function readProjects(tx: Tx, userId: string, id?: string): Promise<Project[]> {
    const rows = await tx
        .select()
        .from(projects)
        .where(
            and(
                or(eq(projects.userId, userId), inArray(projects.id, memberView)),
                id ? eq(projects.id, id) : undefined,
            ),
        )
        .orderBy(projects.createdAt);
    const members = rows.length
        ? await tx
              .select()
              .from(listMembers)
              .where(
                  inArray(
                      listMembers.listId,
                      rows.map((row) => row.id),
                  ),
              )
              .orderBy(listMembers.joinedAt)
        : [];
    const joined = new Map(members.filter((member) => member.userId === userId).map((m) => [m.listId, m]));
    const decorated = rows.map((row) => {
        const mine = joined.get(row.id);
        return {
            ...row,
            access: row.userId === userId ? ("owner" as const) : (mine?.role ?? ("view" as const)),
            members: members
                .filter((member) => member.listId === row.id)
                .map(({ userId, role, invitedBy }) => ({ userId, role, invitedBy })),
        };
    });
    const own = decorated.filter((row) => row.userId === userId);
    const shared = decorated
        .filter((row) => row.userId !== userId)
        .sort((a, b) => (joined.get(a.id)?.joinedAt ?? "").localeCompare(joined.get(b.id)?.joinedAt ?? ""));
    return [...own, ...shared];
}

export async function createProject(tx: Tx, userId: string, body: InsertProject, idempotencyKey?: string) {
    return createOnce(
        tx,
        userId,
        idempotencyKey,
        (id) =>
            tx
                .select()
                .from(projects)
                .where(and(eq(projects.id, id), eq(projects.userId, userId))),
        async () => {
            await assertRowRoom(tx, userId, "lists");
            return tx
                .insert(projects)
                .values({ ...body, userId })
                .returning();
        },
    );
}

export async function updateProject(tx: Tx, userId: string, id: string, body: UpdateProject) {
    const [row] = await tx
        .update(projects)
        .set(body)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .returning();
    throwIfNotFound(row, "Project");
    return row;
}

export async function deleteProject(tx: Tx, userId: string, id: string, { trashOpenTasks = false } = {}) {
    const trashed = trashOpenTasks
        ? await tx
              .update(tasks)
              .set({ state: "ARCHIVED", updatedAt: sql`NOW()` })
              .where(and(eq(tasks.userId, userId), eq(tasks.projectId, id), inArray(tasks.state, OPEN_TASK_STATES)))
              .returning({ id: tasks.id })
        : [];
    const [{ kept }] = await tx
        .select({ kept: count() })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.projectId, id), ne(tasks.state, "ARCHIVED")));
    const [row] = await tx
        .delete(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .returning();
    throwIfNotFound(row, "Project");
    return { project: row, tasksTrashed: trashed.length, tasksUnlisted: kept };
}
