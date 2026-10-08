import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { IS_DESKTOP_RUNTIME, getNativeStore } from "../../platform/runtime";
import { startupMark } from "../startup-timing";
import { log } from "../log";

const IDB_KEY = "cadence-query-cache";
// All account transitions share the same device cache key: serialize writes/removal.
let storageWork: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
    // Any write or removal makes an early read stale.
    early = undefined;
    const next = storageWork.catch(() => {}).then(work);
    storageWork = next;
    return next;
}

async function readSaved(): Promise<PersistedClient | undefined> {
    if (IS_DESKTOP_RUNTIME) {
        const store = await getNativeStore("cadence_cache");
        if (store) return (await store.get<PersistedClient>(IDB_KEY)) ?? undefined;
    }
    return (await get<PersistedClient>(IDB_KEY)) ?? undefined;
}

let early: Promise<PersistedClient | undefined> | undefined;
// Set by a repair so a flush on the way out can't write the old snapshot back.
let frozen = false;
/**
 * Start reading the saved workspace at boot, alongside the session check, instead of
 * after it. The first restore takes this read; the buster still decides whether the
 * snapshot belongs to the account that signs in.
 */
export function prefetchSavedWorkspace(): void {
    early ??= readSaved().catch(() => undefined);
}

/**
 * Settings' repair: drop this device's saved copy of server data and reload, so everything is
 * fetched fresh. Unsynced changes and note drafts live in the WAL, which this never touches.
 */
export async function repairWorkspaceCache(): Promise<void> {
    frozen = true;
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
    window.location.reload();
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
        if (frozen) return;
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
            try {
                await storageWork.catch(() => {});
                const prefetched = early;
                early = undefined;
                return await (prefetched ?? readSaved());
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
