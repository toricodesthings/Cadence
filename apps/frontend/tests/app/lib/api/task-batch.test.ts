import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../../../app/lib/api/client";
import { prefetchTaskBatch } from "../../../../app/lib/api/task-batch";
import { tasksQueryOptions } from "../../../../app/hooks/tasks/use-tasks";
import { queryKeys } from "../../../../app/lib/api/query-keys";
import { makeTask, testQueryClient } from "../../../helpers";

const { snapshot } = vi.hoisted(() => ({ snapshot: vi.fn(() => [] as { status: string }[]) }));
vi.mock("../../../../app/lib/api/offline-wal", () => ({ getWalSnapshot: snapshot }));
vi.mock("../../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));
vi.mock("../../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({}) }));

const active = { state: "ACTIVE" as const };
const waiting = { state: "WAITING" as const };
const capture = { ...active, hasNoDate: true, hasNoProject: true };
const filters = [active, waiting, capture];
const task = makeTask();
let get: ReturnType<typeof vi.fn>;
let singleGet: ReturnType<typeof vi.fn>;
let client: ApiClient;

beforeEach(() => {
    snapshot.mockReturnValue([]);
    get = vi.fn().mockResolvedValue(Response.json({ data: { tasks: [task], lists: [[0], [], [0]] } }));
    singleGet = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    client = { api: { tasks: { $get: singleGet, batch: { $get: get } } } } as unknown as ApiClient;
});

function warm(queryClient = testQueryClient(), controller = new AbortController()) {
    return prefetchTaskBatch(client, queryClient, filters, controller.signal);
}

describe("offline task batching", () => {
    it("uses one transport and fills the ordinary list caches without a separate persisted batch cache", async () => {
        const qc = testQueryClient();
        await warm(qc);
        expect(get).toHaveBeenCalledTimes(1);
        expect(JSON.parse(get.mock.calls[0][0].query.queries)).toEqual([
            active, waiting, { state: "ACTIVE", hasNoProject: "true", hasNoDate: "true" },
        ]);
        expect(qc.getQueryData(queryKeys.tasks.list(active))).toEqual([task]);
        expect(qc.getQueryData(queryKeys.tasks.list(capture))).toEqual([task]);
        expect(qc.getQueryData(queryKeys.tasks.list(waiting))).toEqual([]);
        expect(qc.getQueryCache().getAll()).toHaveLength(3);
        await warm(qc);
        expect(get).toHaveBeenCalledTimes(1);
        qc.clear();
    });

    it("requests only stale or invalidated lists, skipping in-flight foreground reads", async () => {
        const qc = testQueryClient();
        qc.setQueryData(queryKeys.tasks.list(active), [task]);
        qc.setQueryData(queryKeys.tasks.list(capture), []);
        await qc.invalidateQueries({ queryKey: queryKeys.tasks.list(capture), exact: true });
        const foreground = Promise.withResolvers<Response>();
        singleGet.mockReturnValue(foreground.promise);
        const loading = qc.fetchQuery(tasksQueryOptions(client, waiting));
        get.mockResolvedValue(Response.json({ data: { tasks: [], lists: [[]] } }));
        await warm(qc);
        expect(JSON.parse(get.mock.calls[0][0].query.queries)).toEqual([
            { state: "ACTIVE", hasNoProject: "true", hasNoDate: "true" },
        ]);
        foreground.resolve(Response.json({ data: [] }));
        await loading;
        qc.clear();
    });

    it("fetches new server data when a warmed list is explicitly refetched", async () => {
        const qc = testQueryClient();
        await warm(qc);
        singleGet.mockResolvedValue(Response.json({ data: [{ ...task, title: "Changed elsewhere" }] }));
        await qc.refetchQueries({ queryKey: queryKeys.tasks.list(active), exact: true });
        expect(singleGet).toHaveBeenCalledTimes(1);
        expect(qc.getQueryData(queryKeys.tasks.list(active))).toEqual([{ ...task, title: "Changed elsewhere" }]);
        expect(get).toHaveBeenCalledTimes(1);
        qc.clear();
    });

    it("lets foreground consumers join an already warming list", async () => {
        const qc = testQueryClient();
        const deferred = Promise.withResolvers<Response>();
        get.mockReturnValue(deferred.promise);
        const background = warm(qc);
        const foreground = qc.fetchQuery(tasksQueryOptions(client, active));
        deferred.resolve(Response.json({ data: { tasks: [task], lists: [[0], [], [0]] } }));
        await background;
        expect(await foreground).toEqual([task]);
        expect(singleGet).not.toHaveBeenCalled();
        qc.clear();
    });

    it("does not overwrite optimistic data after the task queries are cancelled", async () => {
        const qc = testQueryClient();
        const deferred = Promise.withResolvers<Response>();
        get.mockReturnValue(deferred.promise);
        const warming = warm(qc);
        await qc.cancelQueries({ queryKey: queryKeys.tasks.all });
        qc.setQueryData(queryKeys.tasks.list(active), [{ ...task, title: "Edited locally" }]);
        deferred.resolve(Response.json({ data: { tasks: [task], lists: [[0], [], [0]] } }));
        await warming;
        expect(qc.getQueryData(queryKeys.tasks.list(active))).toEqual([{ ...task, title: "Edited locally" }]);
        qc.clear();
    });

    it("preserves previous data on failure, then retries on the next warming run", async () => {
        const qc = testQueryClient();
        qc.setQueryData(queryKeys.tasks.list(active), [task], { updatedAt: Date.now() - 3_600_001 });
        get.mockResolvedValueOnce(Response.json({ error: { code: "INTERNAL_ERROR", message: "Failed" } }, { status: 503 }));
        await warm(qc);
        expect(qc.getQueryData(queryKeys.tasks.list(active))).toEqual([task]);
        expect(get).toHaveBeenCalledTimes(1);
        await warm(qc);
        expect(get).toHaveBeenCalledTimes(2);
        qc.clear();
    });

    it("skips reads while offline edits wait to sync or the workspace signal is already aborted", async () => {
        const qc = testQueryClient();
        snapshot.mockReturnValue([{ status: "pending" }]);
        await warm(qc);
        snapshot.mockReturnValue([]);
        const controller = new AbortController();
        controller.abort();
        await warm(qc, controller);
        expect(get).not.toHaveBeenCalled();
        qc.clear();
    });

    it("passes workspace cancellation to the shared transport", async () => {
        const qc = testQueryClient();
        const controller = new AbortController();
        let transportSignal: AbortSignal | undefined;
        get.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
            transportSignal = options.init.signal;
            transportSignal!.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
        }));
        const warming = warm(qc, controller);
        controller.abort();
        await warming;
        expect(transportSignal?.aborted).toBe(true);
        expect(qc.getQueryData(queryKeys.tasks.list(active))).toBeUndefined();
        qc.clear();
    });
});
