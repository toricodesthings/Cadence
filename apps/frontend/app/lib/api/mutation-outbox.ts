import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    subscribeWal,
    getWalSnapshot,
    getWalServerSnapshot,
    removeWalEntry,
    updateWalEntry,
    walTargetIds,
    type WalEntry,
} from "./offline-wal";
import { replayWal, retryAndReplay } from "./mutation-executor";
import { invalidateWorkspaceCaches } from "./workspace-cache";

function useWalEntries() {
    return useSyncExternalStore(subscribeWal, getWalSnapshot, getWalServerSnapshot);
}

/**
 * React hook to get the current mutation outbox state.
 * Reads from the durable WAL stored in IndexedDB.
 */
export function useMutationOutbox() {
    const entries = useWalEntries();
    const queryClient = useQueryClient();

    return {
        pending: entries.filter((e) => e.status === "pending").length,
        replaying: entries.filter((e) => e.status === "replaying").length,
        failed: entries.filter((e) => e.status === "failed"),
        total: entries.length,
        /** Flips every failed entry back to pending and replays now. */
        retryFailed: () => {
            void retryAndReplay(queryClient);
        },
        retry: async (entry: WalEntry) => {
            await updateWalEntry(entry.id, { status: "pending", error: undefined });
            await replayWal(queryClient);
        },
        /** Drops one change for good; the refetch then shows what the server has. */
        discard: async (entry: WalEntry) => {
            await removeWalEntry(entry.id);
            await invalidateWorkspaceCaches(queryClient);
        },
    };
}

const idsBySnapshot = new WeakMap<WalEntry[], Set<string>>();

function pendingIds(entries: WalEntry[]): Set<string> {
    let ids = idsBySnapshot.get(entries);
    if (!ids) {
        ids = new Set(entries.flatMap((e) => walTargetIds(e.op)));
        idsBySnapshot.set(entries, ids);
    }
    return ids;
}

/** True while a change to this task, capture or routine waits to sync. */
export function useIsUnsynced(id: string | undefined): boolean {
    return useSyncExternalStore(
        subscribeWal,
        () => Boolean(id) && pendingIds(getWalSnapshot()).has(id!),
        () => false,
    );
}
