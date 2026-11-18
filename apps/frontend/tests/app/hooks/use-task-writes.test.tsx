import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { atLocal } from "@cadence/domain/time";
import { useCreateTask } from "../../../app/hooks/tasks/use-create-task";
import { useBatchRescheduleTasks } from "../../../app/hooks/tasks/use-batch-state";
import { useUpdateTask } from "../../../app/hooks/tasks/use-update-task";
import { queryKeys } from "../../../app/lib/api/query-keys";
import { setUserZone } from "../../../app/lib/utils/user-zone";
import { makeTask, testQueryClient, withClient } from "../../helpers";

const api = vi.hoisted(() => ({ create: vi.fn(), reschedule: vi.fn(), patch: vi.fn() }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({
        api: { tasks: { $post: api.create, ":id": { $patch: api.patch }, batch: { reschedule: { $post: api.reschedule } } } },
    }),
}));
vi.mock("../../../app/lib/api/offline-mutation", () => ({
    withOfflineSupport: (_op: unknown, online: unknown) => online,
    wasQueued: () => false,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("../../../app/hooks/ai/use-memory", () => ({ useDurationApi: () => ({}) }));
vi.mock("../../../app/hooks/ai/use-duration-guess", () => ({ useDurationGuesser: () => () => undefined }));

const ZONE = "America/Toronto";
const listKey = queryKeys.tasks.list({ state: "ACTIVE" });
beforeEach(() => {
    api.create.mockReset();
    api.reschedule.mockReset();
    api.patch.mockReset();
    setUserZone(ZONE);
});

describe("task writes in the one time model", () => {
    it("adds an optimistic row in the new shape (no isAllDay, zone only on a timed block)", async () => {
        api.create.mockReturnValue(new Promise(() => {}));
        const qc = testQueryClient();
        qc.setQueryData(listKey, []);
        const searchNotes = [{ taskId: "note-owner", terms: ["deployment"], headings: [] }];
        qc.setQueryData(queryKeys.notes.search, searchNotes);
        const { result } = renderHook(useCreateTask, { wrapper: withClient(qc) });
        const start = atLocal("2026-03-26", "14:00", ZONE);
        act(() => {
            result.current.mutate({
                title: "Lunch",
                orderIndex: 1,
                scheduledStart: start,
                scheduledEnd: atLocal("2026-03-26", "15:00", ZONE),
            });
        });
        act(() => {
            result.current.mutate({ title: "Rent", orderIndex: 2, dueDate: "2026-03-31" });
        });
        await waitFor(() => expect(qc.getQueryData<Task[]>(listKey)).toHaveLength(2));
        expect(qc.getQueryData(queryKeys.notes.search)).toEqual(searchNotes);
        const [timed, allDay] = qc.getQueryData<Task[]>(listKey)!;
        expect(timed).toMatchObject({ scheduledStart: start, zone: ZONE, dueDate: null, endDate: null });
        expect(allDay).toMatchObject({ dueDate: "2026-03-31", scheduledStart: null, zone: null });
        expect(timed).not.toHaveProperty("isAllDay");
        expect(api.create.mock.calls[0][0].json).not.toHaveProperty("isAllDay");
    });

    it("batch reschedule to a day moves each task by the shared domain rule, sending only the day", async () => {
        api.reschedule.mockResolvedValue(Response.json({ data: [] }));
        const qc = testQueryClient();
        const timed = makeTask({
            id: "10000000-0000-4000-8000-000000000001",
            scheduledStart: atLocal("2026-03-26", "09:30", ZONE),
            scheduledEnd: atLocal("2026-03-26", "10:00", ZONE),
            zone: ZONE,
        });
        const allDay = makeTask({ id: "10000000-0000-4000-8000-000000000002", dueDate: "2026-03-26" });
        qc.setQueryData(listKey, [timed, allDay]);
        const { result } = renderHook(useBatchRescheduleTasks, { wrapper: withClient(qc) });
        act(() => {
            result.current.mutate({ taskIds: [timed.id, allDay.id], date: "2026-03-30" });
        });
        await waitFor(() => expect(api.reschedule).toHaveBeenCalled());
        expect(api.reschedule.mock.calls[0][0].json).toEqual({ taskIds: [timed.id, allDay.id], date: "2026-03-30" });
        const [a, b] = qc.getQueryData<Task[]>(listKey)!;
        expect(a.scheduledStart).toBe(atLocal("2026-03-30", "09:30", ZONE));
        expect(b).toMatchObject({ dueDate: "2026-03-30", scheduledStart: null });
    });

    it("keeps an Undo in place while the check-off it reverses lands", async () => {
        const task = makeTask({ id: "10000000-0000-4000-8000-000000000003", state: "ACTIVE" });
        let land!: (res: Response) => void;
        api.patch
            .mockReturnValueOnce(new Promise<Response>((resolve) => (land = resolve)))
            .mockReturnValueOnce(new Promise(() => {}));
        const qc = testQueryClient();
        qc.setQueryData(listKey, [task]);
        const { result } = renderHook(useUpdateTask, { wrapper: withClient(qc) });
        act(() => result.current.mutate({ id: task.id, state: "COMPLETE" }));
        act(() => result.current.mutate({ id: task.id, state: "ACTIVE" }));
        await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
        await act(async () => land(Response.json({ data: { ...task, state: "COMPLETE" } })));
        await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2));
        expect(qc.getQueryData<Task[]>(listKey)![0].state).toBe("ACTIVE");
    });
});
