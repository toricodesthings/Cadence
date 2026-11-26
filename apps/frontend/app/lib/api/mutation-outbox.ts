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

export function useWalEntries() {
    return useSyncExternalStore(subscribeWal, getWalSnapshot, getWalServerSnapshot);
}

export function useMutationOutbox() {
    const entries = useWalEntries();
    const queryClient = useQueryClient();

    return {
        pending: entries.filter((e) => e.status === "pending").length,
        replaying: entries.filter((e) => e.status === "replaying").length,
        failed: entries.filter((e) => e.status === "failed"),
        total: entries.length,
        retryFailed: () => {
            void retryAndReplay(queryClient);
        },
        retry: async (entry: WalEntry) => {
            await updateWalEntry(entry.id, { status: "pending", error: undefined });
            await replayWal(queryClient);
        },
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

export function useIsUnsynced(id: string | undefined): boolean {
    return useSyncExternalStore(
        subscribeWal,
        () => Boolean(id) && pendingIds(getWalSnapshot()).has(id!),
        () => false,
    );
}
