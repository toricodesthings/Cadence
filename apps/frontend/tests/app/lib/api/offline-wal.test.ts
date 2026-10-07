import { beforeEach, describe, expect, it, vi } from "vitest";
import { hc } from "hono/client";
import { testQueryClient } from "../../../helpers";

const store = new Map<string, unknown>();
const fetchMock = vi.fn();

vi.mock("idb-keyval", () => ({
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => void store.set(key, structuredClone(value)),
    del: async (key: string) => void store.delete(key),
}));
vi.mock("../../../../app/platform/runtime", () => ({ IS_DESKTOP_RUNTIME: false, getNativeStore: async () => null }));
const sessionHeld = vi.hoisted(() => ({ value: false }));
vi.mock("../../../../app/lib/api/client", () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiClient: { api: (hc<any>("https://api.test") as any).api.v1 },
    authenticatedFetch: (url: string, init: RequestInit) => fetchMock(url, init),
    isSessionHeld: () => sessionHeld.value,
}));

const { ApiErrorResponse, networkError } = await import("../../../../app/types/api");
const wal = await import("../../../../app/lib/api/offline-wal");
const { replayWal, toRequests } = await import("../../../../app/lib/api/mutation-executor");
const { withOfflineSupport } = await import("../../../../app/lib/api/offline-mutation");

const TASK = "11111111-1111-4111-8111-111111111111";
const ok = () => Response.json({ data: {} });
const status = (code: number) => Response.json({ error: { code: "X", message: "no", status: code, isRetryable: false } }, { status: code });

beforeEach(async () => {
    store.clear();
    fetchMock.mockReset().mockImplementation(async () => ok());
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await wal.initWal(null);
    await wal.initWal("user-a");
});

describe("offline queue", () => {
    it("keeps each account's queue apart", async () => {
        await wal.enqueueWalEntry({ type: "delete_task", id: TASK });
        await wal.initWal("user-b");
        expect(wal.getWalSnapshot()).toEqual([]);
        await wal.initWal("user-a");
        expect(wal.getWalSnapshot()).toHaveLength(1);
    });

    it("replays a create with its own id as the Idempotency-Key and drops expectedUpdatedAt", async () => {
        await wal.enqueueWalEntry({ type: "create_task", payload: { id: TASK, title: "Offline", orderIndex: 1 } });
        await wal.enqueueWalEntry({ type: "update_task", id: TASK, payload: { title: "Renamed", expectedUpdatedAt: "2026-01-01T00:00:00.000Z" } });

        expect(await replayWal(testQueryClient())).toBe("done");

        const [[createUrl, create], [, update]] = fetchMock.mock.calls;
        expect(createUrl).toBe("https://api.test/api/v1/tasks");
        expect(new Headers(create.headers).get("Idempotency-Key")).toBe(TASK);
        expect(JSON.parse(update.body)).toEqual({ title: "Renamed" });
        expect(wal.getWalSnapshot()).toEqual([]);
    });

    it("stops on a network failure and keeps the rest pending", async () => {
        fetchMock.mockRejectedValueOnce(networkError());
        await wal.enqueueWalEntry({ type: "delete_task", id: TASK });
        await wal.enqueueWalEntry({ type: "duplicate_task", id: TASK });

        expect(await replayWal(testQueryClient())).toBe("offline");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(wal.getWalSnapshot().map((e) => e.status)).toEqual(["pending", "pending"]);
    });

    it("drops an edit to something deleted elsewhere, and holds later changes behind a failed one", async () => {
        const OTHER = "22222222-2222-4222-8222-222222222222";
        fetchMock
            .mockResolvedValueOnce(status(404)) // update of a task deleted elsewhere
            .mockResolvedValueOnce(status(400)); // create rejected
        await wal.enqueueWalEntry({ type: "update_task", id: OTHER, payload: { title: "Gone" } });
        await wal.enqueueWalEntry({ type: "create_task", payload: { id: TASK, title: "", orderIndex: 1 } });
        await wal.enqueueWalEntry({ type: "update_task", id: TASK, payload: { title: "After" } });

        await replayWal(testQueryClient());

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(wal.getWalSnapshot().map((e) => [e.op.type, e.status])).toEqual([
            ["create_task", "failed"],
            ["update_task", "failed"],
        ]);
    });
});

describe("offline notes", () => {
    const note = (body: string, extra: Record<string, unknown> = {}) =>
        ({ type: "upsert_note" as const, taskId: TASK, payload: { body, expectedVersion: 1, branch: "tab-a", baseBody: "base", ...extra } });

    it("folds unsent saves from one editing line on one base into the newest text", async () => {
        await wal.enqueueWalEntry(note("Draft"));
        await wal.enqueueWalEntry(note("Draft, finished"));
        expect(wal.getWalSnapshot().map((e) => e.op)).toEqual([note("Draft, finished")]);
    });

    it("keeps another tab's branch, a different base, and an attempted entry apart", async () => {
        await wal.enqueueWalEntry(note("A"));
        await wal.enqueueWalEntry(note("B", { branch: "tab-b" }));
        await wal.enqueueWalEntry(note("C", { expectedVersion: 2 }));
        const [first] = wal.getWalSnapshot();
        await wal.updateWalEntry(first.id, { attempted: true });
        await wal.enqueueWalEntry(note("A, more"));
        expect(wal.getWalSnapshot().map((e) => (e.op as { payload: { body: string } }).payload.body)).toEqual(["A", "B", "C", "A, more"]);
    });

    it("never folds saves queued by older builds (no branch)", async () => {
        const legacy = (body: string) => ({ type: "upsert_note" as const, taskId: TASK, payload: { body } });
        await wal.enqueueWalEntry(legacy("one"));
        await wal.enqueueWalEntry(legacy("two"));
        expect(wal.getWalSnapshot()).toHaveLength(2);
    });

    it("merges edits to different places when the note changed elsewhere", async () => {
        fetchMock
            .mockResolvedValueOnce(status(409))
            .mockResolvedValueOnce(Response.json({ data: { body: "one\n\ntwo\n\nTHREE", version: 5 } }))
            .mockResolvedValueOnce(Response.json({ data: {} }));
        await wal.enqueueWalEntry(note("ONE\n\ntwo\n\nthree", { baseBody: "one\n\ntwo\n\nthree" }));

        await replayWal(testQueryClient());

        const saved = JSON.parse(fetchMock.mock.calls[2][1].body);
        expect(saved).toEqual({ body: "ONE\n\ntwo\n\nTHREE", expectedVersion: 5 });
        expect(wal.getWalSnapshot()).toEqual([]);
    });

    it("holds an overlapping edit for review instead of appending it to the note", async () => {
        fetchMock
            .mockResolvedValueOnce(status(409))
            .mockResolvedValueOnce(Response.json({ data: { body: "From the laptop", version: 9 } }));
        await wal.enqueueWalEntry(note("From the phone", { baseBody: "Start" }));

        await replayWal(testQueryClient());

        expect(fetchMock).toHaveBeenCalledTimes(2); // no write of any combined text
        const [entry] = wal.getWalSnapshot();
        expect(entry).toMatchObject({ status: "failed", conflict: true });
        expect((entry.op as { payload: { body: string } }).payload.body).toBe("From the phone");
    });

    it("sends the save's operation id as its Idempotency-Key", async () => {
        fetchMock.mockResolvedValueOnce(Response.json({ data: {} }));
        await wal.enqueueWalEntry(note("x", { opId: "op-77" }), toRequests(note("x", { opId: "op-77" })));
        await replayWal(testQueryClient());
        expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("op-77");
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ body: "x", expectedVersion: 1 });
    });
});

describe("withOfflineSupport", () => {
    const op = () => ({ type: "delete_task" as const, id: TASK });

    it("queues a write whose request never got an answer instead of losing it", async () => {
        const write = withOfflineSupport(op, async () => { throw networkError(); });
        await expect(write(undefined)).resolves.toBeUndefined();
        expect(wal.getWalSnapshot()).toHaveLength(1);
    });

    it("still throws when the server answers with an error", async () => {
        const write = withOfflineSupport(op, async () => { throw new ApiErrorResponse({ status: 400, code: "VALIDATION_ERROR", message: "no" }); });
        await expect(write(undefined)).rejects.toMatchObject({ status: 400 });
        expect(wal.getWalSnapshot()).toEqual([]);
    });

    it("queues behind earlier changes that haven't synced, even online", async () => {
        const apiFn = vi.fn();
        fetchMock.mockRejectedValue(networkError());
        await wal.enqueueWalEntry({ type: "create_task", payload: { id: TASK, title: "Offline", orderIndex: 1 } });
        await withOfflineSupport(op, apiFn)(undefined);
        expect(apiFn).not.toHaveBeenCalled();
        expect(wal.getWalSnapshot().map((e) => e.op.type)).toEqual(["create_task", "delete_task"]);
    });
    it("queues a write made before a warm start's session check answers", async () => {
        const apiFn = vi.fn();
        fetchMock.mockRejectedValue(networkError());
        sessionHeld.value = true;
        try {
            expect(await withOfflineSupport(op, apiFn)(undefined)).toBeUndefined();
        } finally {
            sessionHeld.value = false;
        }
        expect(apiFn).not.toHaveBeenCalled();
        expect(wal.getWalSnapshot().map((e) => e.op.type)).toEqual(["delete_task"]);
    });
});
