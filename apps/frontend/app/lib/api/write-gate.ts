import type { QueryClient, QueryKey } from "@tanstack/react-query";

export const isLastWrite = (qc: QueryClient) => qc.isMutating() <= 1;

const held = new Map<string, QueryKey>();

export function refetchAfterWrites(qc: QueryClient, queryKey: QueryKey, exact = false) {
    if (!isLastWrite(qc)) {
        held.set(JSON.stringify([queryKey, exact]), queryKey);
        return Promise.resolve();
    }
    return qc.invalidateQueries({ queryKey, exact });
}

export function flushHeldRefetches(qc: QueryClient) {
    if (!isLastWrite(qc)) return;
    for (const [id, queryKey] of held) void qc.invalidateQueries({ queryKey, exact: JSON.parse(id)[1] });
    held.clear();
}

export function isOnlyWriteTo(qc: QueryClient, id: string) {
    const writes = qc.getMutationCache().findAll({
        status: "pending",
        predicate: ({ state: { variables: v } }) =>
            v === id || (typeof v === "object" && v !== null && (v as { id?: unknown }).id === id),
    });
    return writes.length <= 1;
}
