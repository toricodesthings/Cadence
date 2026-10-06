import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { createIDBPersister, type ManagedPersister } from "../../../../app/lib/api/persister";

const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
vi.mock("idb-keyval", () => storage);
vi.mock("../../../../app/platform/runtime", () => ({ IS_DESKTOP_RUNTIME: false, getNativeStore: vi.fn() }));
const snapshot = (timestamp: number): PersistedClient => ({ timestamp, buster: "account", clientState: { queries: [], mutations: [] } });
let persister: ManagedPersister;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); storage.set.mockResolvedValue(undefined); persister = createIDBPersister(); });
afterEach(() => { persister.dispose(); vi.useRealTimers(); });

describe("workspace cache persistence", () => {
    it("coalesces a burst and saves the newest complete snapshot", async () => {
        const writes = Array.from({ length: 50 }, (_, i) => persister.persistClient(snapshot(i)));
        expect(storage.set).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(250);
        await Promise.all(writes);
        expect(storage.set).toHaveBeenCalledExactlyOnceWith("cadence-query-cache", snapshot(49));
    });
    it("flushes the latest snapshot immediately on hide and account disposal", async () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        const saved = persister.persistClient(snapshot(1));
        document.dispatchEvent(new Event("visibilitychange"));
        await saved;
        const next = persister.persistClient(snapshot(2));
        persister.dispose();
        await next;
        expect(storage.set.mock.calls.map((call) => call[1].timestamp)).toEqual([1, 2]);
    });
    it("waits for an in-flight write before removing the cache and drops scheduled saves", async () => {
        const delayed = Promise.withResolvers<void>();
        storage.set.mockReturnValueOnce(delayed.promise);
        const first = persister.persistClient(snapshot(1));
        const flushing = persister.flush();
        await vi.advanceTimersByTimeAsync(1);
        const scheduled = persister.persistClient(snapshot(2));
        const removed = persister.removeClient();
        expect(storage.del).not.toHaveBeenCalled();
        delayed.resolve();
        await Promise.all([first, flushing, scheduled, removed]);
        await vi.advanceTimersByTimeAsync(300);
        expect(storage.set).toHaveBeenCalledTimes(1);
        expect(storage.del).toHaveBeenCalledWith("cadence-query-cache");
    });
});

it("restores the stored snapshot untouched (old-shape data is dropped by the cache buster, not here)", async () => {
    const qc = new QueryClient();
    const keys = [["tasks", { state: "ACTIVE" }], ["habits", "weekly", { start: "2026-03-06", end: "2026-03-10" }, false]];
    for (const key of keys) qc.setQueryData(key, []);
    storage.get.mockResolvedValue({ ...snapshot(1), clientState: dehydrate(qc) });
    const restored = await persister.restoreClient();
    expect(restored?.clientState.queries.map(q => q.queryKey)).toEqual(keys);
    expect(restored?.buster).toBe("account");
    qc.clear();
});
