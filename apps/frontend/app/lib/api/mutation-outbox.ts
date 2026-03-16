import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MutationOp } from "./offline-wal";
import {
    enqueueWalEntry,
    subscribeWal,
    getWalSnapshot,
    getWalServerSnapshot,
    clearFailedEntries,
} from "./offline-wal";
import { retryAndReplay } from "./mutation-executor";

/**
 * Queue a mutation for offline replay.
 * If online, the mutation is NOT queued here — the hook should call the API directly.
 * Only call this when offline to persist the operation for later replay.
 */
export async function queueMutation(op: MutationOp): Promise<void> {
    await enqueueWalEntry(op);
}

/**
 * React hook to get the current mutation outbox state.
 * Reads from the durable WAL stored in IndexedDB.
 *
 * `retryFailed` flips failed entries back to pending AND immediately
 * replays them so the user sees real sync progress.
 */
export function useMutationOutbox() {
    const entries = useSyncExternalStore(subscribeWal, getWalSnapshot, getWalServerSnapshot);
    const queryClient = useQueryClient();

    return {
        pending: entries.filter((e) => e.status === "pending").length,
        replaying: entries.filter((e) => e.status === "replaying").length,
        failed: entries.filter((e) => e.status === "failed"),
        total: entries.length,
        retryFailed: () => {
            void retryAndReplay(queryClient);
        },
        dismissFailed: () => {
            clearFailedEntries();
        },
    };
}
