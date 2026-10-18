import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { useUpdateTask } from "../../../app/hooks/tasks/use-update-task";
import { toRequests } from "../../../app/lib/api/mutation-executor";
import { describeChange } from "../../../app/lib/api/describe-change";
import { queryKeys } from "../../../app/lib/api/query-keys";
import { makeTask, testQueryClient, withClient } from "../../helpers";

const api = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({ api: { tasks: { ":id": { $patch: api.patch } } } }) }));
vi.mock("../../../app/lib/api/offline-mutation", () => ({ withOfflineSupport: (_op: unknown, online: unknown) => online, wasQueued: () => false }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: {} }) }));
vi.mock("../../../app/hooks/ai/use-duration-guess", () => ({ useDurationGuesser: () => () => null, useDurationGuess: () => null }));
vi.mock("../../../app/hooks/ai/use-memory", () => ({ useDurationApi: () => ({ ask: vi.fn(), shown: vi.fn(), report: vi.fn() }) }));
vi.mock("../../../app/lib/utils/error-toast", () => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

// A fresh id per test: writes to one task queue behind each other, and the first test never settles.
let SERIES = "";
let n = 0;
const listKey = queryKeys.tasks.list({ state: "ACTIVE" });
const seed = () => {
    SERIES = `20000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    const qc = testQueryClient();
    qc.setQueryData(listKey, [
        makeTask({ id: SERIES, recurrenceRule: "FREQ=DAILY", linkedAppId: "gmail" }),
        makeTask({ id: `${SERIES}::2026-10-13`, seriesId: SERIES, isRecurringInstance: true, recurrenceRule: "FREQ=DAILY", linkedAppId: "gmail", dueDate: "2026-10-13" }),
        makeTask({ id: "other", linkedAppId: "spotify" }),
    ]);
    return qc;
};

beforeEach(() => api.patch.mockReset());


describe("saving an app on a task", () => {
    it("sends an explicit null to remove, and patches the series' cached occurrences only for the app", async () => {
        api.patch.mockResolvedValue(Response.json({ data: makeTask({ linkedAppId: null }) }));
        const qc = seed();
        const { result } = renderHook(useUpdateTask, { wrapper: withClient(qc) });
        act(() => { result.current.mutate({ id: SERIES, linkedAppId: null }); });
        await waitFor(() => expect(api.patch).toHaveBeenCalled());
        expect(api.patch.mock.calls[0][0].json).toMatchObject({ linkedAppId: null });
        const [parent, occurrence, other] = qc.getQueryData<Task[]>(listKey)!;
        expect(parent.linkedAppId).toBeNull();
        expect(occurrence).toMatchObject({ linkedAppId: null, dueDate: "2026-10-13" });
        expect(other.linkedAppId).toBe("spotify");
    });

    it("rolls the choice back on a failed save", async () => {
        api.patch.mockResolvedValue(Response.json({ error: { code: "INTERNAL_ERROR", message: "x" } }, { status: 500 }));
        const qc = seed();
        const { result } = renderHook(useUpdateTask, { wrapper: withClient(qc) });
        await act(async () => { await result.current.mutateAsync({ id: SERIES, linkedAppId: "outlook" }).catch(() => undefined); });

        const [parent, occurrence] = qc.getQueryData<Task[]>(listKey)!;
        expect(parent.linkedAppId).toBe("gmail");
        expect(occurrence.linkedAppId).toBe("gmail");
    });

    it("undo after a change sends the earlier id", async () => {
        api.patch.mockResolvedValue(Response.json({ data: makeTask({ id: SERIES }) }));
        const qc = seed();
        const { result } = renderHook(useUpdateTask, { wrapper: withClient(qc) });
        await act(async () => { await result.current.mutateAsync({ id: SERIES, linkedAppId: null }).catch(() => undefined); });
        await act(async () => { await result.current.mutateAsync({ id: SERIES, linkedAppId: "gmail" }).catch(() => undefined); });
        expect(api.patch.mock.calls.map((call) => call[0].json.linkedAppId)).toEqual([null, "gmail"]);
    });
});

describe("a queued app change", () => {
    it("replays an explicit null and drops the version check", () => {
        const [task] = toRequests({ type: "update_task", id: "t", payload: { linkedAppId: null, expectedUpdatedAt: "2026-10-12T00:00:00.000Z" } });
        expect(task.json).toEqual({ linkedAppId: null });
        const [habit] = toRequests({ type: "update_habit", id: "h", payload: { linkedAppId: null, expectedUpdatedAt: "x" } });
        expect(habit.json).toEqual({ linkedAppId: null });
    });

    it("reads as the app's name in sync review, never its id", () => {
        const titleOf = () => "Check emails";
        expect(describeChange({ type: "update_task", id: "t", payload: { linkedAppId: "google-calendar" } }, titleOf)).toBe("App: Google Calendar on “Check emails”");
        expect(describeChange({ type: "update_habit", id: "h", payload: { linkedAppId: null } }, titleOf)).toBe("App removed on “Check emails”");
        expect(describeChange({ type: "update_task", id: "t", payload: { linkedAppId: null, linkedUrl: "https://www.example.com/a/long/private/path" } }, titleOf)).toBe("Website: example.com on “Check emails”");
        expect(describeChange({ type: "update_task", id: "t", payload: { linkedAppId: null, linkedUrl: null } }, titleOf)).toBe("App removed on “Check emails”");
        expect(describeChange({ type: "update_task", id: "t", payload: { linkedAppId: "gmail", title: "x" } }, titleOf)).toBe("Edit “Check emails”");
    });
});
