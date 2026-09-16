/**
 * On-device cache for the user's background photo.
 *
 * The photo is served from a private, authenticated endpoint, so it can't be
 * referenced by URL from CSS or an <img> and would otherwise be re-fetched on
 * every boot. The blob is kept in its own IndexedDB store, one entry per
 * account, and cleared on sign-out along with the rest of the device's data.
 */

import { createStore, del, get, keys, set } from "idb-keyval";

const store = createStore("cadence-backgrounds", "images");
let generation = 0;
let acceptingWrites = true;
let pendingWrite: Promise<void> = Promise.resolve();

/** Invalidates work started before a deletion or sign-out, including uploads. */
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
    pendingWrite = pendingWrite.then(operation).catch(() => {
        // Blocked/full storage must not prevent using the app.
    });
    return pendingWrite;
}

function entryKey(userId: string, imageId: string): string {
    return `${userId}:${imageId}`;
}

export async function readCachedBackgroundImage(userId: string, imageId: string): Promise<Blob | null> {
    try {
        return (await get<Blob>(entryKey(userId, imageId), store)) ?? null;
    } catch {
        return null; // private mode or blocked storage — fall back to the network
    }
}

/** Store this photo and drop any earlier one for the same account. */
export function cacheBackgroundImage(
    userId: string, imageId: string, blob: Blob, expectedGeneration: number,
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

/** Forget every photo; queued writes from before this call cannot restore it. */
export function clearCachedBackgroundImages(userId?: string): Promise<void> {
    generation += 1;
    return serializeWrite(async () => {
        const all = await keys<string>(store);
        const targets = userId ? all.filter((key) => key.startsWith(`${userId}:`)) : all;
        await Promise.all(targets.map((key) => del(key, store)));
    });
}
