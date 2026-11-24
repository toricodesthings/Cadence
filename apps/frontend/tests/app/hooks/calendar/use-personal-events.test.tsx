import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePersonalEvents } from "../../../../app/hooks/calendar/use-personal-events";
import { withClient } from "../../../helpers";

const { get, post, patch, del, message, error } = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
}));
vi.mock("../../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({
        api: { "personal-events": { $get: get, $post: post, ":id": { $patch: patch, $delete: del } } },
    }),
}));
vi.mock("../../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ authReady: true, isAuthenticated: true }),
}));
vi.mock("../../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: undefined }),
    useUpdateSettings: () => ({ mutate: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { message, error } }));

const ID = "01970000-0000-7000-8000-000000000001";
const mom = { id: ID, label: "Mom", monthDay: "03-14", emoji: null, notify: true, startedOn: null };

async function setup() {
    get.mockResolvedValue(Response.json({ data: [mom] }));
    const hook = renderHook(() => usePersonalEvents(2026), { wrapper: withClient() });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    return hook;
}

describe("usePersonalEvents", () => {
    beforeEach(() => {
        [get, post, patch, del, message, error].forEach((fn) => fn.mockReset());
    });

    it("adds optimistically and posts with the item id as its Idempotency-Key", async () => {
        const { result } = await setup();
        post.mockImplementation(async ({ json }) => Response.json({ data: json }, { status: 201 }));
        let added!: { id: string };
        act(() => {
            added = result.current.addEvent({
                label: "Gran",
                monthDay: "05-02",
                emoji: null,
                notify: true,
                startedOn: null,
            });
        });
        await waitFor(() => expect(result.current.items.map((e) => e.label)).toContain("Gran"));
        await waitFor(() => expect(post).toHaveBeenCalled());
        expect(post.mock.calls[0][0].json.id).toBe(added.id);
        expect(post.mock.calls[0][1]).toEqual({ headers: { "Idempotency-Key": added.id } });
    });

    it("rolls back a failed add and says so", async () => {
        const { result } = await setup();
        post.mockResolvedValue(new Response("{}", { status: 500 }));
        act(() => {
            result.current.addEvent({ label: "Gran", monthDay: "05-02", emoji: null, notify: true, startedOn: null });
        });
        await waitFor(() => expect(error).toHaveBeenCalled());
        expect(error.mock.calls[0][0]).toBe("Couldn't add event");
        await waitFor(() => expect(result.current.items.map((e) => e.label)).toEqual(["Mom"]));
    });

    it("sends only editable fields on update, and rolls back a failure", async () => {
        const { result } = await setup();
        let fail!: () => void;
        patch.mockReturnValue(new Promise((resolve) => (fail = () => resolve(new Response("{}", { status: 500 })))));
        act(() => result.current.updateEvent(ID, { ...mom, label: "Mum" }));
        await waitFor(() => expect(result.current.items[0].label).toBe("Mum"));
        await waitFor(() => expect(patch).toHaveBeenCalled());
        fail();
        expect(patch.mock.calls[0][0].json).not.toHaveProperty("id");
        await waitFor(() => expect(error).toHaveBeenCalled());
        await waitFor(() => expect(result.current.items[0].label).toBe("Mom"));
    });

    it("deletes only after the Undo window, and Undo sends nothing", async () => {
        const { result } = await setup();
        del.mockResolvedValue(Response.json({ data: mom }));
        act(() => result.current.removeEvent(ID));
        await waitFor(() => expect(message).toHaveBeenCalled());
        await waitFor(() => expect(result.current.items).toHaveLength(0));
        expect(del).not.toHaveBeenCalled();
        await act(async () => message.mock.calls[0][1].onAutoClose());
        await waitFor(() => expect(del).toHaveBeenCalledWith({ param: { id: ID } }));
    });

    it("Undo means the server is never asked", async () => {
        const { result } = await setup();
        act(() => result.current.removeEvent(ID));
        await waitFor(() => expect(message).toHaveBeenCalled());
        await act(async () => message.mock.calls[0][1].action.onClick());
        expect(del).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });
});
