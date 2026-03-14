import { useSyncExternalStore } from "react";
import type { MutationOp } from "./offline-wal";
import {
    enqueueWalEntry,
    subscribeWal,
    getWalSnapshot,
    getWalServerSnapshot,
    clearFailedEntries,
    retryFailedEntries,
} from "./offline-wal";

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
 */
export function useMutationOutbox() {
    const entries = useSyncExternalStore(subscribeWal, getWalSnapshot, getWalServerSnapshot);

    return {
        pending: entries.filter((e) => e.status === "pending").length,
        replaying: entries.filter((e) => e.status === "replaying").length,
        failed: entries.filter((e) => e.status === "failed"),
        total: entries.length,
        retryFailed: () => {
            retryFailedEntries();
        },
        dismissFailed: () => {
            clearFailedEntries();
        },
    };
}
