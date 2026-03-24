import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { IS_DESKTOP_RUNTIME, getNativeStore } from "../../platform/runtime";

const IDB_KEY = "cadence-query-cache";

/**
 * IndexedDB-backed persister for TanStack Query.
 * Stores the dehydrated query cache so the app boots with data offline.
 */
export function createIDBPersister(): Persister {
    return {
        persistClient: async (client: PersistedClient) => {
            if (IS_DESKTOP_RUNTIME) {
                const store = await getNativeStore("cadence_cache");
                if (store) {
                    await store.set(IDB_KEY, client);
                    return;
                }
            }
            await set(IDB_KEY, client);
        },
        restoreClient: async () => {
            if (IS_DESKTOP_RUNTIME) {
                const store = await getNativeStore("cadence_cache");
                if (store) return (await store.get<PersistedClient>(IDB_KEY)) ?? undefined;
            }
            return (await get<PersistedClient>(IDB_KEY)) ?? undefined;
        },
        removeClient: async () => {
            if (IS_DESKTOP_RUNTIME) {
                const store = await getNativeStore("cadence_cache");
                if (store) {
                    await store.del(IDB_KEY);
                    return;
                }
            }
            await del(IDB_KEY);
        },
    };
}
