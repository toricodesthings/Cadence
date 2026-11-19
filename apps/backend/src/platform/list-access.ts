/**
 * Who may do what in a shared list. Shared rows stay the owner's (`user_id`), so a route that targets a list or its
 * tasks resolves the caller's role here, enforces it, then calls the unchanged service with `ownerId`. RLS decides
 * what the caller can reach; passing an owner id never widens it. No domain imports.
 */
import { and, count, eq, inArray } from "drizzle-orm";
import type { Context } from "hono";
import type { LiveChange } from "@cadence/contracts/live";
import type { ListRole, ShareRole } from "@cadence/contracts/sharing";
import { listMembers, projects, tasks } from "../db/schema";
import { AppError } from "./errors";
import type { AuthVariables } from "./auth";
import type { Tx } from "../types/db";
import type { Env } from "../types/env";

export type { ListRole };
export type ListAccess = { listId: string; ownerId: string; role: ListRole; audience: string[] };

/** Abuse ceilings (Manifesto §8): far above real use, never a tier. */
export const SHARE_CEILINGS = { people: 20, listsJoined: 100, links: 20, tasksPerList: 10_000 } as const;

type Member = { userId: string; role: ShareRole };

/** The caller's role in a list, or null when they aren't in it. */
export function roleIn(callerId: string, ownerId: string, members: Member[]): ListRole | null {
    if (callerId === ownerId) return "owner";
    return members.find((member) => member.userId === callerId)?.role ?? null;
}

/** The owner plus every member, each once. */
export function audienceOf(ownerId: string, members: Member[]): string[] {
    return [...new Set([ownerId, ...members.map((member) => member.userId)])];
}

/** Resolve the caller's access to each list (one read of the lists, one of their members). 404 when one isn't visible to them. */
export async function listAccesses(tx: Tx, callerId: string, listIds: string[]): Promise<Map<string, ListAccess>> {
    const ids = [...new Set(listIds)];
    const result = new Map<string, ListAccess>();
    if (!ids.length) return result;
    const lists = await tx
        .select({ id: projects.id, ownerId: projects.userId })
        .from(projects)
        .where(inArray(projects.id, ids));
    if (lists.length !== ids.length) throw new AppError(404, "NOT_FOUND", "List not found");
    const members = await tx
        .select({ listId: listMembers.listId, userId: listMembers.userId, role: listMembers.role })
        .from(listMembers)
        .where(inArray(listMembers.listId, ids));
    for (const list of lists) {
        const here = members.filter((member) => member.listId === list.id);
        const role = roleIn(callerId, list.ownerId, here);
        if (!role) throw new AppError(404, "NOT_FOUND", "List not found");
        result.set(list.id, { listId: list.id, ownerId: list.ownerId, role, audience: audienceOf(list.ownerId, here) });
    }
    return result;
}

export async function listAccess(tx: Tx, callerId: string, listId: string): Promise<ListAccess> {
    return (await listAccesses(tx, callerId, [listId])).get(listId)!;
}

/**
 * Group task ids by the list that governs them, so each group is written under one role. A task in a list
 * (shared with the caller or not) carries that list's access, whose audience is who hears of the write; the
 * caller's unlisted tasks get `access: null`. A missing id is 404, as if it were absent (`skipMissing`: left out).
 */
export async function tasksByOwner(
    tx: Tx,
    callerId: string,
    taskIds: string[],
    { skipMissing = false }: { skipMissing?: boolean } = {},
): Promise<{ access: ListAccess | null; ids: string[] }[]> {
    const unique = [...new Set(taskIds)];
    const rows = unique.length
        ? await tx
              .select({ id: tasks.id, userId: tasks.userId, projectId: tasks.projectId })
              .from(tasks)
              .where(inArray(tasks.id, unique))
        : [];
    if (!skipMissing && rows.length !== unique.length) throw new AppError(404, "NOT_FOUND", "Task not found");
    // A visible task owned by someone else is always in a list shared with the caller.
    if (rows.some((row) => row.userId !== callerId && !row.projectId))
        throw new AppError(404, "NOT_FOUND", "Task not found");
    const access = await listAccesses(
        tx,
        callerId,
        rows.flatMap((row) => (row.projectId ? [row.projectId] : [])),
    );
    const groups = new Map<string, { access: ListAccess | null; ids: string[] }>();
    for (const row of rows) {
        const found = row.projectId ? access.get(row.projectId)! : null;
        const group = groups.get(found?.listId ?? "none") ?? { access: found, ids: [] };
        group.ids.push(row.id);
        groups.set(found?.listId ?? "none", group);
    }
    return [...groups.values()];
}

/** The task's list access, or null for the caller's own task. */
export async function taskAccess(tx: Tx, callerId: string, taskId: string): Promise<ListAccess | null> {
    return (await tasksByOwner(tx, callerId, [taskId]))[0].access;
}

export function requireEdit(access: ListAccess | null): void {
    if (access?.role === "view") throw new AppError(403, "VIEW_ONLY", "You can view this list, not change it.");
}

export function requireOwner(access: ListAccess | null): void {
    if (access && access.role !== "owner")
        throw new AppError(403, "OWNER_ONLY", "Only the owner of this list can do that.");
}

type RouteContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

/** Everyone who should hear of this write (merged into `liveAudience`; `replanAfterWrites` pings them). */
export function noteAudience(c: RouteContext, ...accesses: (ListAccess | null)[]): void {
    const ids = new Set(c.get("liveAudience") ?? []);
    for (const access of accesses) for (const id of access?.audience ?? []) ids.add(id);
    c.set("liveAudience", [...ids]);
}

/** A row the write returned, pushed to everyone who can read it. */
export function noteChange(c: RouteContext, change: LiveChange): void {
    c.set("liveChanges", [...(c.get("liveChanges") ?? []), change]);
}

/** What a recipient is allowed to see of a change: tags belong to the owner, so everyone else gets none. */
export function shapeFor(change: LiveChange, recipientId: string): LiveChange {
    if (change.type !== "task" || change.task.userId === recipientId) return change;
    return { ...change, task: { ...change.task, tagIds: [] } };
}

/** 10,000 tasks per shared list. `assertRowRoom` under a member's RLS counts only shared rows, so it can't stand in. */
export async function assertListRoom(tx: Tx, listId: string, adding = 1): Promise<void> {
    const [{ n }] = await tx
        .select({ n: count() })
        .from(tasks)
        .where(and(eq(tasks.projectId, listId)));
    if (n + adding > SHARE_CEILINGS.tasksPerList)
        throw new AppError(
            413,
            "STORAGE_FULL",
            "This list has reached its size ceiling. Remove some tasks to add more.",
        );
}
