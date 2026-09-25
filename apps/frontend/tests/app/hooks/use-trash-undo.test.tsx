import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useArchiveTask } from "../../../app/hooks/tasks/use-archive-task";
import { useTaskDetailsRequest } from "../../../app/hooks/ui/use-task-details-request";
import { withClient } from "../../helpers";

const { patch, toast } = vi.hoisted(() => ({
    patch: vi.fn(),
    toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { tasks: { ":id": { $patch: patch } } } }),
}));
vi.mock("sonner", () => ({ toast }));

const setup = () => renderHook(() => useArchiveTask(), { wrapper: withClient() });
const response = (state: string) => Response.json({ data: { id: "task-1", state, title: "Test task" } });

describe("Trash Undo", () => {
    beforeEach(() => {
        patch.mockReset();
        toast.mockClear();
        toast.error.mockClear();
    });

    it("reopens the restored task after the deleting editor has unmounted", async () => {
        const open = vi.fn();
        renderHook(() => useTaskDetailsRequest(open));
        patch.mockResolvedValueOnce(response("ARCHIVED")).mockResolvedValueOnce(response("ACTIVE"));
        const editor = setup();
        await act(async () => { await editor.result.current.mutateAsync("task-1"); });
        const undo = toast.mock.calls[0][1].action.onClick;
        editor.unmount();
        expect(open).not.toHaveBeenCalled();

        act(() => undo());
        await waitFor(() => expect(open).toHaveBeenCalledWith("task-1"));
        expect(patch).toHaveBeenLastCalledWith({ param: { id: "task-1" }, json: { state: "ACTIVE" } });
    });

    it("keeps details closed if restoration fails", async () => {
        const open = vi.fn();
        renderHook(() => useTaskDetailsRequest(open));
        patch.mockResolvedValueOnce(response("ARCHIVED")).mockRejectedValueOnce(new Error("Restore failed"));
        const editor = setup();
        await act(async () => { await editor.result.current.mutateAsync("task-1"); });
        act(() => toast.mock.calls[0][1].action.onClick());
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Restore failed"));
        expect(open).not.toHaveBeenCalled();
    });
});
