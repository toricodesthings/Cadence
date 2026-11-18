import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * A write that reads the server back (refetch, rollback, its row) while a later write is still in flight
 * shows that later change undone for a moment: the flash. So only the last write in flight reads back.
 * These run from mutation callbacks, where the calling write still counts as pending.
 */
export const isLastWrite = (qc: QueryClient) => qc.isMutating() <= 1;

const held = new Map<string, QueryKey>();

/** Refetch `queryKey` now, or once the last write in flight settles (`flushHeldRefetches`). */
export function refetchAfterWrites(qc: QueryClient, queryKey: QueryKey, exact = false) {
    if (!isLastWrite(qc)) {
        held.set(JSON.stringify([queryKey, exact]), queryKey);
        return Promise.resolve();
    }
    return qc.invalidateQueries({ queryKey, exact });
}

/** MutationCache `onSettled`: the last write in flight runs the refetches the earlier ones held back. */
export function flushHeldRefetches(qc: QueryClient) {
    if (!isLastWrite(qc)) return;
    for (const [id, queryKey] of held) void qc.invalidateQueries({ queryKey, exact: JSON.parse(id)[1] });
    held.clear();
}

/** No other write to the row with this id is in flight, so the server's copy of it is safe to show. */
export function isOnlyWriteTo(qc: QueryClient, id: string) {
    const writes = qc.getMutationCache().findAll({
        status: "pending",
        predicate: ({ state: { variables: v } }) =>
            v === id || (typeof v === "object" && v !== null && (v as { id?: unknown }).id === id),
    });
    return writes.length <= 1;
}
