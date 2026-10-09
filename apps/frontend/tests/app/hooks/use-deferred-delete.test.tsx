import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeleteTag } from "../../../app/hooks/tags/use-delete-tag";
import { withClient } from "../../helpers";

const { del, message, error } = vi.hoisted(() => ({ del: vi.fn(), message: vi.fn(), error: vi.fn() }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { tags: { ":id": { $delete: del } } } }),
}));
vi.mock("sonner", () => ({ toast: { message, error } }));


function setup() {
    const wrapper = withClient();
    const hook = renderHook(() => useDeleteTag(), { wrapper });
    return hook;
}

describe("deferred delete (tag)", () => {
    beforeEach(() => {
        del.mockReset();
        message.mockClear();
        error.mockClear();
    });

    it("sends nothing until the Undo window closes", async () => {
        del.mockResolvedValue(Response.json({ data: { id: "t1" } }));
        const { result } = setup();
        let done!: Promise<unknown>;
        act(() => { done = result.current.mutateAsync({ id: "t1", name: "Errands" }); });
        await waitFor(() => expect(message).toHaveBeenCalledWith("Deleted tag Errands", expect.anything()));
        expect(del).not.toHaveBeenCalled();
        await act(async () => { message.mock.calls[0][1].onAutoClose(); await done; });
        expect(del).toHaveBeenCalledWith({ param: { id: "t1" } });
    });

    it("Undo means the server is never asked, and no error toast shows", async () => {
        const { result } = setup();
        let done!: Promise<unknown>;
        act(() => { done = result.current.mutateAsync({ id: "t1", name: "Errands" }).catch(() => undefined); });
        await waitFor(() => expect(message).toHaveBeenCalled());
        await act(async () => { message.mock.calls[0][1].action.onClick(); await done; });
        expect(del).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });
});

