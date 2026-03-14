import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProcessInboxToTask } from "../../../app/hooks/inbox/use-process-inbox-to-task";

const taskPostMock = vi.fn();
const inboxDeleteMock = vi.fn();
const useApiClientMock = vi.fn();

vi.mock("../../../app/hooks/use-api-client", () => ({
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
        taskPostMock.mockReset();
        inboxDeleteMock.mockReset();
        useApiClientMock.mockReset();
        useApiClientMock.mockReturnValue({
            api: {
                tasks: {
                    $post: taskPostMock,
                },
                inbox: {
                    ":id": {
                        $delete: inboxDeleteMock,
                    },
                },
            },
        });
    });

    it("creates a task and deletes the inbox item by default", async () => {
        const createdTask = { id: "task-1", title: "Buy groceries" };
        taskPostMock.mockResolvedValue(
            new Response(JSON.stringify({ data: createdTask }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            }),
        );
        inboxDeleteMock.mockResolvedValue(new Response(null, { status: 204 }));

        const { result } = renderHook(() => useProcessInboxToTask(), {
            wrapper: createWrapper(),
        });

        result.current.mutate({ inboxItemId: "inbox-1", rawText: "Buy groceries" });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(taskPostMock).toHaveBeenCalledOnce();
        expect(inboxDeleteMock).toHaveBeenCalledWith({
            param: { id: "inbox-1" },
        });
    });

    it("keeps the inbox item when keepNote is true", async () => {
        const createdTask = { id: "task-2", title: "Meeting notes" };
        taskPostMock.mockResolvedValue(
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

        expect(taskPostMock).toHaveBeenCalledOnce();
        expect(inboxDeleteMock).not.toHaveBeenCalled();
    });

    it("surfaces an error when the task creation fails", async () => {
        taskPostMock.mockResolvedValue(
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
        expect(inboxDeleteMock).not.toHaveBeenCalled();
    });
});
