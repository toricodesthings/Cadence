import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProcessInboxToTask } from "../../../app/hooks/inbox/use-process-inbox-to-task";
import { testQueryClient, withClient } from "../../helpers";
import { queryKeys } from "../../../app/lib/api/query-keys";
import type { Task } from "@cadence/contracts/task";

const inboxProcessMock = vi.fn();

vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { inbox: { ":id": { process: { $post: inboxProcessMock } } } } }),
}));

const { toastMessage } = vi.hoisted(() => ({ toastMessage: vi.fn() }));
vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn(), message: toastMessage },
}));

describe("useProcessInboxToTask", () => {
    beforeEach(() => {
        inboxProcessMock.mockReset();
    });

    it("processes the inbox item atomically by default", async () => {
        inboxProcessMock.mockResolvedValue(Response.json({ data: { id: "task-1", title: "Buy groceries" } }, { status: 201 }));

        const { result } = renderHook(() => useProcessInboxToTask(), { wrapper: withClient() });

        result.current.mutate({ inboxItemId: "10000000-0000-4000-8000-000000000001", rawText: "Buy groceries" });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(inboxProcessMock).toHaveBeenCalledWith({
            param: { id: "10000000-0000-4000-8000-000000000001" },
            json: expect.objectContaining({
                title: "Buy groceries",
            }),
        });
    });

    it("passes through scheduling metadata when placing an inbox item", async () => {
        inboxProcessMock.mockResolvedValue(Response.json({ data: { id: "task-2", title: "Meeting notes" } }, { status: 201 }));

        const { result } = renderHook(() => useProcessInboxToTask(), { wrapper: withClient() });

        result.current.mutate({
            inboxItemId: "10000000-0000-4000-8000-000000000002",
            rawText: "Meeting notes",
            dueDate: "2026-03-27",
            scheduledStart: "2026-03-27T15:30:00.000Z",
            scheduledEnd: "2026-03-27T16:00:00.000Z",
            priority: 2,
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(inboxProcessMock).toHaveBeenCalledOnce();
        expect(inboxProcessMock).toHaveBeenCalledWith({
            param: { id: "10000000-0000-4000-8000-000000000002" },
            json: expect.objectContaining({
                title: "Meeting notes",
                dueDate: "2026-03-27",
                scheduledStart: "2026-03-27T15:30:00.000Z",
                scheduledEnd: "2026-03-27T16:00:00.000Z",
                    priority: 2,
            }),
        });
    });

    it("surfaces an error when the task creation fails", async () => {
        inboxProcessMock.mockResolvedValue(Response.json({ error: { message: "Server error" } }, { status: 500 }));

        const { result } = renderHook(() => useProcessInboxToTask(), { wrapper: withClient() });

        result.current.mutate({ inboxItemId: "10000000-0000-4000-8000-000000000003", rawText: "Broken" });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(inboxProcessMock).toHaveBeenCalledOnce();
    });
    it("shows the task in its list at once, then names it in the toast with where it went", async () => {
        const { promise, resolve } = Promise.withResolvers<Response>();
        inboxProcessMock.mockReturnValue(promise);
        const client = testQueryClient();
        const key = [...queryKeys.tasks.all, { state: "ACTIVE", hasNoProject: true, hasNoDate: true }];
        client.setQueryData<Task[]>(key, []);

        const { result } = renderHook(() => useProcessInboxToTask(), { wrapper: withClient(client) });
        result.current.mutate({ inboxItemId: "10000000-0000-4000-8000-000000000004", rawText: "Call Maya" });

        // Before the server answers: already a task with no day, never a thought in between.
        await waitFor(() => expect(client.getQueryData<Task[]>(key)?.map((task) => task.title)).toEqual(["Call Maya"]));

        resolve(Response.json({ data: { id: "task-4", title: "Call Maya", state: "ACTIVE", projectId: null, dueDate: null, scheduledStart: null } }, { status: 201 }));
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(client.getQueryData<Task[]>(key)?.map((task) => task.id)).toEqual(["task-4"]);
        expect(toastMessage).toHaveBeenCalledWith("Call Maya", expect.objectContaining({ description: "No day yet" }));
    });
});
