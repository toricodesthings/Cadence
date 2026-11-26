import { inArray } from "drizzle-orm";
import { loadShare } from "@cadence/domain/load-share";
import { listMembers, projects } from "../db/schema";
import type { Tx } from "../types/db";

export async function withLoadShares<T extends { projectId?: string | null; takenBy?: string | null }>(
    tx: Tx,
    userId: string,
    rows: readonly T[],
): Promise<(T & { share: number })[]> {
    const ids = [...new Set(rows.map((r) => r.projectId).filter((id): id is string => !!id))];
    const doers = new Map<string, string[]>();
    if (ids.length) {
        const [members, lists] = await Promise.all([
            tx
                .select({ listId: listMembers.listId, userId: listMembers.userId, role: listMembers.role })
                .from(listMembers)
                .where(inArray(listMembers.listId, ids)),
            tx.select({ id: projects.id, userId: projects.userId }).from(projects).where(inArray(projects.id, ids)),
        ]);
        const owners = new Map(lists.map((l) => [l.id, l.userId]));
        for (const m of members) {
            if (!doers.has(m.listId)) doers.set(m.listId, owners.has(m.listId) ? [owners.get(m.listId)!] : []);
            if (m.role === "edit") doers.get(m.listId)!.push(m.userId);
        }
    }
    return rows.map((r) => ({ ...r, share: loadShare(r, userId, (id) => doers.get(id)) }));
}
