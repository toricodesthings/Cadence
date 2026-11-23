import { inArray } from "drizzle-orm";
import type { ListPerson, ListRole } from "@cadence/contracts/sharing";
import { listMembers, taskSections, tasks } from "../../../db/schema";
import { AppError } from "../../../platform/errors";
import { listPeople } from "../../sharing/sharing.service";
import type { Tx } from "../../../types/db";

const nonEmpty = (ids?: (string | null | undefined)[]): string[] => [
    ...new Set((ids ?? []).filter((id): id is string => Boolean(id))),
];

/**
 * Assistant writes to shared lists (lists with at least one member) are refused in 2.3.0,
 * owner included. Unshared lists pass through unchanged.
 */
export async function assertNotShared(
    tx: Tx,
    targets: {
        taskIds?: (string | null | undefined)[];
        projectIds?: (string | null | undefined)[];
        sectionIds?: (string | null | undefined)[];
    },
): Promise<void> {
    const listIds = new Set(nonEmpty(targets.projectIds));
    const taskIds = nonEmpty(targets.taskIds);
    const sectionIds = nonEmpty(targets.sectionIds);

    if (taskIds.length) {
        const rows = await tx.select({ projectId: tasks.projectId }).from(tasks).where(inArray(tasks.id, taskIds));
        for (const row of rows) if (row.projectId) listIds.add(row.projectId);
    }
    if (sectionIds.length) {
        const rows = await tx
            .select({ projectId: taskSections.projectId })
            .from(taskSections)
            .where(inArray(taskSections.id, sectionIds));
        for (const row of rows) if (row.projectId) listIds.add(row.projectId);
    }
    if (!listIds.size) return;

    const shared = await tx
        .select({ listId: listMembers.listId })
        .from(listMembers)
        .where(inArray(listMembers.listId, [...listIds]))
        .limit(1);
    if (shared.length > 0) {
        throw new AppError(
            403,
            "SHARED_READ_ONLY",
            "Changes to shared lists aren't available to the assistant yet. Open the list to change it.",
        );
    }
}

export type SharedPeopleMap = Map<string, ListPerson[]>;

/**
 * For a set of list ids, loads the people in each list that is actually shared (has at least one member).
 * Unshared lists are omitted from the returned map.
 */
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

/** Shared-list attribution for a projected task row (names only, never ids or emails). */
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

/** Shared-list summary for a projected list row (caller's role + people's names and roles, never ids or emails). */
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
