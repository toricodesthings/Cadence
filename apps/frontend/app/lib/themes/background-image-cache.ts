import { createStore, del, get, keys, set } from "idb-keyval";

const store = createStore("cadence-backgrounds", "images");
let generation = 0;
let acceptingWrites = true;
let pendingWrite: Promise<void> = Promise.resolve();

export function backgroundCacheGeneration(): number {
    return generation;
}

export function setBackgroundCacheSessionActive(active: boolean): void {
    if (acceptingWrites !== active) generation += 1;
    acceptingWrites = active;
}

export function isBackgroundCacheCurrent(expected: number): boolean {
    return acceptingWrites && generation === expected;
}

function serializeWrite(operation: () => Promise<void>): Promise<void> {
    pendingWrite = pendingWrite.then(operation).catch(() => {});
    return pendingWrite;
}

function entryKey(userId: string, imageId: string): string {
    return `${userId}:${imageId}`;
}

export async function readCachedBackgroundImage(userId: string, imageId: string): Promise<Blob | null> {
    try {
        return (await get<Blob>(entryKey(userId, imageId), store)) ?? null;
    } catch {
        return null;
    }
}

export function cacheBackgroundImage(
    userId: string,
    imageId: string,
    blob: Blob,
    expectedGeneration: number,
): Promise<void> {
    return serializeWrite(async () => {
        if (!isBackgroundCacheCurrent(expectedGeneration)) return;
        await set(entryKey(userId, imageId), blob, store);
        const stale = (await keys<string>(store)).filter(
            (key) => key.startsWith(`${userId}:`) && key !== entryKey(userId, imageId),
        );
        await Promise.all(stale.map((key) => del(key, store)));
    });
}

export function clearCachedBackgroundImages(userId?: string): Promise<void> {
    generation += 1;
    return serializeWrite(async () => {
        const all = await keys<string>(store);
        const targets = userId ? all.filter((key) => key.startsWith(`${userId}:`)) : all;
        await Promise.all(targets.map((key) => del(key, store)));
    });
}
