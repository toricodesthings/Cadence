import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toastError } from "../utils/error-toast";
import { isUndone } from "../utils/undo-toast";
import { transformListCache } from "./cache-guards";
import { wasQueued } from "./offline-mutation";
import { isLastWrite, refetchAfterWrites } from "./write-gate";

type CacheSnapshot = Array<[QueryKey, unknown]>;

export function createOptimisticHelpers<TItem = unknown>(cacheKeys: readonly QueryKey[]) {
    return {
        snapshot(qc: QueryClient): CacheSnapshot[] {
            return cacheKeys.map((key) => qc.getQueriesData({ queryKey: key }));
        },

        rollback(qc: QueryClient, snapshots: CacheSnapshot[]) {
            if (!isLastWrite(qc)) return;
            for (const group of snapshots) {
                for (const [key, data] of group) {
                    if (data !== undefined) qc.setQueryData(key, data);
                }
            }
        },

        invalidate(qc: QueryClient) {
            return Promise.all(cacheKeys.map((key) => refetchAfterWrites(qc, key)));
        },

        settle(qc: QueryClient, data: unknown, error: unknown) {
            if (!wasQueued(data, error)) void this.invalidate(qc);
        },

        cancel(qc: QueryClient) {
            return Promise.all(cacheKeys.map((key) => qc.cancelQueries({ queryKey: key })));
        },

        async edit(qc: QueryClient, edit: (items: TItem[]) => TItem[]) {
            await this.cancel(qc);
            const snapshot = this.snapshot(qc);
            for (const key of cacheKeys) {
                qc.setQueriesData<TItem[]>({ queryKey: key }, (old) => transformListCache(old, edit));
            }
            return { snapshot };
        },

        fail(qc: QueryClient, err: unknown, context: { snapshot: CacheSnapshot[] } | undefined, message: string) {
            if (context?.snapshot) this.rollback(qc, context.snapshot);
            toastError(err, message);
            this.invalidate(qc);
        },

        undo(qc: QueryClient, err: unknown, context: { snapshot: CacheSnapshot[] } | undefined, message: string) {
            if (context) this.rollback(qc, context.snapshot);
            if (!isUndone(err)) toastError(err, message);
        },
    };
}
