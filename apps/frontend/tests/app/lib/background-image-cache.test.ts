import { describe, expect, it, vi } from "vitest";
const data = vi.hoisted(() => new Map<string, Blob>());
vi.mock("idb-keyval", () => ({
    createStore: () => ({}),
    get: async (key: string) => data.get(key),
    set: async (key: string, blob: Blob) => { data.set(key, blob); },
    keys: async () => [...data.keys()],
    del: async (key: string) => { data.delete(key); },
}));
import { backgroundCacheGeneration, cacheBackgroundImage, clearCachedBackgroundImages, setBackgroundCacheSessionActive } from "../../../app/lib/themes/background-image-cache";

describe("private background cache lifecycle", () => {
    it("rejects late writes from work started before sign-out", async () => {
        const generation = backgroundCacheGeneration();
        const write = cacheBackgroundImage("user", "old", new Blob(["private"]), generation);
        const clear = clearCachedBackgroundImages();
        await Promise.all([write, clear]);
        await cacheBackgroundImage("user", "late", new Blob(["private"]), generation);
        expect(data.size).toBe(0);
    });
    it("blocks newly started writes while sign-out is in progress", async () => {
        setBackgroundCacheSessionActive(false);
        await cacheBackgroundImage("user", "during-signout", new Blob(), backgroundCacheGeneration());
        expect(data.size).toBe(0);
        setBackgroundCacheSessionActive(true);
    });
    it("retains only the latest photo per account under overlapping writes", async () => {
        const generation = backgroundCacheGeneration();
        await Promise.all([
            cacheBackgroundImage("user", "first", new Blob(), generation),
            cacheBackgroundImage("user", "second", new Blob(), generation),
            cacheBackgroundImage("other", "photo", new Blob(), generation),
        ]);
        expect([...data.keys()].sort()).toEqual(["other:photo", "user:second"]);
        await clearCachedBackgroundImages();
    });
});
