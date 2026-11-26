import { OPEN_TASK_STATES } from "@cadence/contracts/task";
import { and, inArray, sql } from "drizzle-orm";
import type { ListPerson, ListRole } from "@cadence/contracts/sharing";
import { listMembers, tasks } from "../../../db/schema";
import { AppError } from "../../../platform/errors";
import type { ListAccess } from "../../../platform/list-access";
import { listPeople } from "../../sharing/sharing.service";
import type { Tx } from "../../../types/db";
import type { AgentContext } from "./index";

const nonEmpty = (ids?: (string | null | undefined)[]): string[] => [
    ...new Set((ids ?? []).filter((id): id is string => Boolean(id))),
];

export type SharedPeopleMap = Map<string, ListPerson[]>;

export async function sharedListPeople(tx: Tx, projectIds: (string | null | undefined)[]): Promise<SharedPeopleMap> {
    const ids = nonEmpty(projectIds);
    const result: SharedPeopleMap = new Map();
    if (!ids.length) return result;

    const memberRows = await tx
        .selectDistinct({ listId: listMembers.listId })
        .from(listMembers)
        .where(inArray(listMembers.listId, ids));
    const sharedIds = memberRows.map((row) => row.listId);
    if (!sharedIds.length) return result;

    const lists = await Promise.all(sharedIds.map(async (id) => [id, await listPeople(tx, id)] as const));
    for (const [id, people] of lists) result.set(id, people);
    return result;
}

export function sharedTaskMeta(
    peopleMap: SharedPeopleMap,
    row: { projectId: string | null; userId?: string; createdBy?: string | null; takenBy?: string | null },
): { shared?: true; createdByName?: string | null; takenByName?: string | null } {
    if (!row.projectId) return {};
    const people = peopleMap.get(row.projectId);
    if (!people) return {};
    const nameOf = (id: string | null | undefined) => (id ? (people.find((p) => p.userId === id)?.name ?? null) : null);
    return {
        shared: true,
        createdByName: nameOf(row.createdBy ?? row.userId),
        takenByName: nameOf(row.takenBy),
    };
}

export function sharedProjectMeta(
    peopleMap: SharedPeopleMap,
    projectId: string,
    callerId: string,
): { role: ListRole; people: { name: string | null; role: ListRole }[] } | undefined {
    const people = peopleMap.get(projectId);
    if (!people) return undefined;
    const role = people.find((p) => p.userId === callerId)?.role ?? "view";
    return {
        role,
        people: people.map(({ name, role: personRole }) => ({ name, role: personRole })),
    };
}

export function recordSeenSharedTasks(
    ctx: AgentContext,
    rows: { id: string; projectId: string | null; updatedAt?: Date | string | null }[],
    peopleMap: SharedPeopleMap,
): void {
    for (const row of rows) {
        if (!row.projectId || !peopleMap.has(row.projectId) || !row.updatedAt) continue;
        if (!ctx.seenTaskUpdatedAt) ctx.seenTaskUpdatedAt = new Map();
        const iso = typeof row.updatedAt === "string" ? row.updatedAt : row.updatedAt.toISOString();
        ctx.seenTaskUpdatedAt.set(row.id, iso);
    }
}

export async function assertTasksNotStale(
    tx: Tx,
    taskIds: string[],
    ctx: AgentContext,
    explicitExpected?: string,
): Promise<void> {
    const checked = taskIds
        .map((id) => ({ id, expected: explicitExpected ?? ctx.seenTaskUpdatedAt?.get(id) }))
        .filter((entry): entry is { id: string; expected: string } => Boolean(entry.expected));
    if (!checked.length) return;

    const rows = await tx
        .select({
            id: tasks.id,
            title: tasks.title,
            projectId: tasks.projectId,
            userId: tasks.userId,
            updatedBy: tasks.updatedBy,
            updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .where(
            inArray(
                tasks.id,
                checked.map((c) => c.id),
            ),
        );

    const peopleMap = await sharedListPeople(
        tx,
        rows.map((r) => r.projectId),
    );
    if (!peopleMap.size) return;

    const expectedById = new Map(checked.map((c) => [c.id, new Date(c.expected).getTime()]));
    for (const row of rows) {
        if (!row.projectId) continue;
        const people = peopleMap.get(row.projectId);
        if (!people) continue;
        const expectedMs = expectedById.get(row.id);
        if (expectedMs === undefined || Number.isNaN(expectedMs)) continue;
        const actualMs = new Date(row.updatedAt).getTime();
        if (Math.floor(actualMs) > Math.floor(expectedMs)) {
            const editor = people.find((p) => p.userId === (row.updatedBy ?? row.userId))?.name ?? "Someone";
            throw new AppError(
                409,
                "STALE_WRITE",
                `${editor} changed "${row.title}" a moment ago. Read it again before changing it.`,
            );
        }
    }
}

export async function sharedCreateDuplicates(
    tx: Tx,
    drafts: { title: string; projectId?: string | null }[],
): Promise<{ id: string; title: string; projectId: string; createdBy?: string }[]> {
    const projectIds = nonEmpty(drafts.map((d) => d.projectId));
    if (!projectIds.length) return [];
    const peopleMap = await sharedListPeople(tx, projectIds);
    const sharedIds = [...peopleMap.keys()];
    if (!sharedIds.length) return [];

    const wantedPairs = new Set(
        drafts
            .filter((d) => d.projectId && peopleMap.has(d.projectId))
            .map((d) => `${d.projectId}|${d.title.trim().toLowerCase()}`),
    );
    if (!wantedPairs.size) return [];

    const titles = [...new Set(drafts.map((d) => d.title.trim().toLowerCase()))];
    const existing = await tx
        .select({
            id: tasks.id,
            title: tasks.title,
            projectId: tasks.projectId,
            userId: tasks.userId,
            createdBy: tasks.createdBy,
        })
        .from(tasks)
        .where(
            and(
                inArray(tasks.projectId, sharedIds),
                inArray(tasks.state, OPEN_TASK_STATES),
                inArray(sql`lower(${tasks.title})`, titles),
            ),
        )
        .limit(20);

    return existing
        .filter((row) => row.projectId && wantedPairs.has(`${row.projectId}|${row.title.trim().toLowerCase()}`))
        .map((row) => {
            const people = peopleMap.get(row.projectId!) ?? [];
            const creator = people.find((p) => p.userId === (row.createdBy ?? row.userId))?.name ?? undefined;
            return { id: row.id, title: row.title, projectId: row.projectId!, ...(creator && { createdBy: creator }) };
        });
}

export function audienceOfAccesses(accesses: (ListAccess | null | undefined)[]): string[] {
    const out = new Set<string>();
    for (const access of accesses) {
        if (!access) continue;
        for (const id of access.audience) out.add(id);
    }
    return [...out];
}

export type ScopedBroadcast = { audience: string[]; changes: import("@cadence/contracts/live").LiveChange[] };

export function scopeLiveBroadcasts(
    accesses: (ListAccess | null | undefined)[],
    changes: import("@cadence/contracts/live").LiveChange[],
    goneListById?: Map<string, string>,
): ScopedBroadcast[] {
    const byList = new Map<string, ScopedBroadcast>();
    for (const access of accesses) {
        if (!access || access.audience.length <= 1) continue;
        if (!byList.has(access.listId)) byList.set(access.listId, { audience: access.audience, changes: [] });
    }
    if (!byList.size) return [];
    for (const change of changes) {
        const listId =
            change.type === "task"
                ? change.task.projectId
                : change.type === "list"
                  ? change.listId
                  : change.type === "task.gone"
                    ? goneListById?.get(change.id)
                    : undefined;
        if (!listId) continue;
        byList.get(listId)?.changes.push(change);
    }
    return [...byList.values()].filter((entry) => entry.changes.length > 0);
}
