import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { IS_DESKTOP_RUNTIME, getNativeStore } from "../../platform/runtime";
import { startupMark } from "../startup-timing";
import { log } from "../log";

/**
 * Legacy routine ranges have no zone; retain all other offline data unchanged.
 * ponytail: delete once a release with zoned keys is 14 days old (OFFLINE_CACHE_MAX_AGE); none remain then.
 */
function compatibleSnapshot(client: PersistedClient | undefined) {
    if (!client) return client;
    return { ...client, clientState: { ...client.clientState, queries: client.clientState.queries.filter(({ queryKey }) =>
        queryKey[0] !== "habits" || queryKey[1] !== "weekly" ||
        (typeof queryKey[2] === "object" && queryKey[2] !== null && "timezone" in queryKey[2])) } };
}

const IDB_KEY = "cadence-query-cache";
// All account transitions share the same device cache key: serialize writes/removal.
let storageWork: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = storageWork.catch(() => {}).then(work);
    storageWork = next;
    return next;
}

export interface ManagedPersister extends Persister {
    flush: () => Promise<void>;
    dispose: () => void;
}

/**
 * IndexedDB-backed persister for TanStack Query.
 * Stores the dehydrated query cache so the app boots with data offline.
 */
export function createIDBPersister(): ManagedPersister {
    let latest: PersistedClient | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: ReturnType<typeof Promise.withResolvers<void>> | undefined;
    const write = async (client: PersistedClient) => {
        if (IS_DESKTOP_RUNTIME) {
            const store = await getNativeStore("cadence_cache");
            if (store) {
                await store.set(IDB_KEY, client);
                return;
            }
        }
        await set(IDB_KEY, client);
    };
    const flush = async () => {
        clearTimeout(timer);
        timer = undefined;
        const client = latest;
        const waiting = pending;
        latest = pending = undefined;
        if (!client) { await storageWork.catch(() => {}); return; }
        try {
            await serialize(() => write(client));
            waiting?.resolve();
        } catch (error) {
            log.warn("cache", "Couldn't save the workspace cache.", error);
            waiting?.reject(error);
        }
    };
    const onHide = () => {
        if (document.visibilityState === "hidden") void flush();
    };
    return {
        // Coalesce storage/clone work only; TanStack still owns dehydration.
        persistClient: (client: PersistedClient) => {
            // Attach only when used, never during React render (including abandoned renders).
            if (typeof document !== "undefined") document.addEventListener("visibilitychange", onHide);
            latest = client;
            pending ??= Promise.withResolvers<void>();
            // TanStack's subscription does not await saves. Retain rejection for
            // callers that await it while preventing an unhandled background failure.
            void pending.promise.catch(() => {});
            timer ??= setTimeout(() => { void flush(); }, 250);
            return pending.promise;
        },
        flush,
        dispose: () => {
            if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHide);
            // Enqueue before the next account restores or starts writing.
            void flush().catch((error) => log.warn("cache", "Couldn't save the workspace cache.", error));
        },
        restoreClient: async () => {
            startupMark("restore.start");
            startupMark("hydrate.start");
            try {
                await storageWork.catch(() => {});
                if (IS_DESKTOP_RUNTIME) {
                    const store = await getNativeStore("cadence_cache");
                    if (store) return compatibleSnapshot((await store.get<PersistedClient>(IDB_KEY)) ?? undefined);
                }
                return compatibleSnapshot((await get<PersistedClient>(IDB_KEY)) ?? undefined);
            } finally {
                startupMark("restore.ready");
            }
        },
        removeClient: async () => {
            clearTimeout(timer);
            timer = undefined;
            latest = undefined;
            pending?.resolve();
            pending = undefined;
            await serialize(async () => {
                if (IS_DESKTOP_RUNTIME) {
                    const store = await getNativeStore("cadence_cache");
                    if (store) {
                        await store.del(IDB_KEY);
                        return;
                    }
                }
                await del(IDB_KEY);
            });
        },
    };
}
