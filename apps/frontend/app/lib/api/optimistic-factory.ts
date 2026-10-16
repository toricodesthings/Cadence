import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toastError } from "../utils/error-toast";
import { transformListCache } from "./cache-guards";

type CacheSnapshot = Array<[QueryKey, unknown]>;

/**
 * Creates a set of optimistic-update helpers (snapshot / rollback / invalidate / cancel)
 * scoped to one or more query-key prefixes.
 *
 * Usage:
 *   const taskCache = createOptimisticHelpers([queryKeys.tasks.all]);
 *   const habitCache = createOptimisticHelpers([
 *     queryKeys.habits.all,
 *     queryKeys.habits.weekly({}),  // prefix match
 *   ]);
 */
export function createOptimisticHelpers<TItem = unknown>(cacheKeys: readonly QueryKey[]) {
  return {
    snapshot(qc: QueryClient): CacheSnapshot[] {
      return cacheKeys.map((key) => qc.getQueriesData({ queryKey: key }));
    },

    rollback(qc: QueryClient, snapshots: CacheSnapshot[]) {
      for (const group of snapshots) {
        for (const [key, data] of group) {
          if (data !== undefined) qc.setQueryData(key, data);
        }
      }
    },

    invalidate(qc: QueryClient) {
      return Promise.all(
        cacheKeys.map((key) => qc.invalidateQueries({ queryKey: key })),
      );
    },

    cancel(qc: QueryClient) {
      return Promise.all(
        cacheKeys.map((key) => qc.cancelQueries({ queryKey: key })),
      );
    },

    /** `onMutate`: stop in-flight reads, remember the caches, and show `edit` in every cached list. The result is the context `fail` rolls back. */
    async edit(qc: QueryClient, edit: (items: TItem[]) => TItem[]) {
      await this.cancel(qc);
      const snapshot = this.snapshot(qc);
      for (const key of cacheKeys) {
        qc.setQueriesData<TItem[]>({ queryKey: key }, (old) => transformListCache(old, edit));
      }
      return { snapshot };
    },

    /** `onError` for `edit`: put the lists back, say what failed, and refetch. */
    fail(qc: QueryClient, err: unknown, context: { snapshot: CacheSnapshot[] } | undefined, message: string) {
      if (context?.snapshot) this.rollback(qc, context.snapshot);
      toastError(err, message);
      this.invalidate(qc);
    },
  };
}
