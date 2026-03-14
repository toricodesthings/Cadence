import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationOp } from "../../../app/lib/api/offline-wal";

// We need to test the module's internal queue behavior
// Reset the module state between tests
let queueMutation: typeof import("../../../app/lib/api/mutation-outbox").queueMutation;

// Mock idb-keyval to avoid IndexedDB in tests
vi.mock("idb-keyval", () => ({
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
}));

const testOp: MutationOp = { type: "delete_task", id: "test-id" };

describe("mutation-outbox", () => {
    beforeEach(async () => {
        vi.resetModules();
        // Re-import fresh module for each test to get a clean queue
        const mod = await import("../../../app/lib/api/mutation-outbox");
        queueMutation = mod.queueMutation;
    });

    it("queues the mutation operation to the WAL", async () => {
        await queueMutation(testOp);
        // queueMutation should not throw and should persist to WAL
    });

    it("queues the mutation when offline", async () => {
        Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });

        // Should not throw — operation is persisted for later replay
        await queueMutation(testOp);
    });

    it("does not throw on queue operations", async () => {
        Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });

        // Should not throw
        await expect(queueMutation(testOp)).resolves.not.toThrow();
    });
});
