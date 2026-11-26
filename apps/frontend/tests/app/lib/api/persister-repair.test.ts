import { expect, it, vi } from "vitest";
import { createIDBPersister, repairWorkspaceCache } from "../../../../app/lib/api/persister";

const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
vi.mock("idb-keyval", () => storage);
vi.mock("../../../../app/platform/runtime", () => ({ IS_DESKTOP_RUNTIME: false, getNativeStore: vi.fn() }));

it("repair removes the saved copy and a flush on the way out can't write it back", async () => {
    const persister = createIDBPersister();
    const pending = persister.persistClient({
        timestamp: 1,
        buster: "account",
        clientState: { queries: [], mutations: [] },
    });
    await repairWorkspaceCache();
    await persister.flush();
    await pending;
    expect(storage.del).toHaveBeenCalledWith("cadence-query-cache");
    expect(storage.set).not.toHaveBeenCalled();
    persister.dispose();
});
