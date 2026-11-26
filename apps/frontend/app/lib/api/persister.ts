import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { IS_DESKTOP_RUNTIME, getNativeStore } from "../../platform/runtime";
import { startupMark } from "../startup-timing";
import { log } from "../log";

const IDB_KEY = "cadence-query-cache";
let storageWork: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
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
let frozen = false;
export function prefetchSavedWorkspace(): void {
    early ??= readSaved().catch(() => undefined);
}

async function deleteSaved() {
    if (IS_DESKTOP_RUNTIME) {
        const store = await getNativeStore("cadence_cache");
        if (store) {
            await store.del(IDB_KEY);
            return;
        }
    }
    await del(IDB_KEY);
}

export async function repairWorkspaceCache(): Promise<void> {
    frozen = true;
    await serialize(deleteSaved);
    window.location.reload();
}

export interface ManagedPersister extends Persister {
    flush: () => Promise<void>;
    dispose: () => void;
}

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
        if (!client) {
            await storageWork.catch(() => {});
            return;
        }
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
        persistClient: (client: PersistedClient) => {
            if (typeof document !== "undefined") document.addEventListener("visibilitychange", onHide);
            latest = client;
            pending ??= Promise.withResolvers<void>();
            void pending.promise.catch(() => {});
            timer ??= setTimeout(() => {
                void flush();
            }, 250);
            return pending.promise;
        },
        flush,
        dispose: () => {
            if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHide);
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
            await serialize(deleteSaved);
        },
    };
}
