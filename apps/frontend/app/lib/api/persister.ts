import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const IDB_KEY = "cadence-query-cache";

/**
 * IndexedDB-backed persister for TanStack Query.
 * Stores the dehydrated query cache so the app boots with data offline.
 */
export function createIDBPersister(): Persister {
    return {
        persistClient: async (client: PersistedClient) => {
            await set(IDB_KEY, client);
        },
        restoreClient: async () => {
            return (await get<PersistedClient>(IDB_KEY)) ?? undefined;
        },
        removeClient: async () => {
            await del(IDB_KEY);
        },
    };
}
