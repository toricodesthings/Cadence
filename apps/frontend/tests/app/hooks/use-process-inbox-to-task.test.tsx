import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProcessInboxToTask } from "../../../app/hooks/inbox/use-process-inbox-to-task";

const inboxProcessMock = vi.fn();
const useApiClientMock = vi.fn();

vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => useApiClientMock(),
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}

describe("useProcessInboxToTask", () => {
    beforeEach(() => {
        inboxProcessMock.mockReset();
        useApiClientMock.mockReset();
        useApiClientMock.mockReturnValue({
            api: {
                inbox: {
                    ":id": {
                        process: {
                            $post: inboxProcessMock,
                        },
                    },
                },
            },
        });
    });

    it("processes the inbox item atomically by default", async () => {
        const createdTask = { id: "task-1", title: "Buy groceries" };
        inboxProcessMock.mockResolvedValue(
            new Response(JSON.stringify({ data: createdTask }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const { result } = renderHook(() => useProcessInboxToTask(), {
            wrapper: createWrapper(),
        });

        result.current.mutate({ inboxItemId: "inbox-1", rawText: "Buy groceries" });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(inboxProcessMock).toHaveBeenCalledWith({
            param: { id: "inbox-1" },
            json: expect.objectContaining({
                clientMutationId: expect.any(String),
                title: "Buy groceries",
            }),
        });
    });

    it("keeps the inbox item when keepNote is true", async () => {
        const createdTask = { id: "task-2", title: "Meeting notes" };
        inboxProcessMock.mockResolvedValue(
            new Response(JSON.stringify({ data: createdTask }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const { result } = renderHook(() => useProcessInboxToTask(), {
            wrapper: createWrapper(),
        });

        result.current.mutate({ inboxItemId: "inbox-2", rawText: "Meeting notes", keepNote: true });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(inboxProcessMock).toHaveBeenCalledOnce();
        expect(inboxProcessMock).toHaveBeenCalledWith({
            param: { id: "inbox-2" },
            json: expect.objectContaining({
                keepNote: true,
                title: "Meeting notes",
            }),
        });
    });

    it("surfaces an error when the task creation fails", async () => {
        inboxProcessMock.mockResolvedValue(
            new Response(JSON.stringify({ error: { message: "Server error" } }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const { result } = renderHook(() => useProcessInboxToTask(), {
            wrapper: createWrapper(),
        });

        result.current.mutate({ inboxItemId: "inbox-3", rawText: "Broken" });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(inboxProcessMock).toHaveBeenCalledOnce();
    });
});
