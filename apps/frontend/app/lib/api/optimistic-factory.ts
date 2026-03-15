import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { invalidateEverywhere } from "./workspace-cache";

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
export function createOptimisticHelpers(cacheKeys: readonly QueryKey[]) {
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
        cacheKeys.map((key) => invalidateEverywhere(qc, key)),
      );
    },

    cancel(qc: QueryClient) {
      return Promise.all(
        cacheKeys.map((key) => qc.cancelQueries({ queryKey: key })),
      );
    },
  };
}

export type OptimisticCacheHelpers = ReturnType<typeof createOptimisticHelpers>;
