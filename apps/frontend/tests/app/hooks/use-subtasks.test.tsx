import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSubtasksByTaskIds } from "../../../app/hooks/tasks/use-subtasks";

const bulkPostMock = vi.fn();

vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({
        api: {
            subtasks: {
                bulk: {
                    $post: bulkPostMock,
                },
            },
        },
    }),
}));

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({
        authReady: true,
        isAuthenticated: true,
    }),
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

describe("useSubtasksByTaskIds", () => {
    beforeEach(() => {
        bulkPostMock.mockReset();
    });

    it("fetches subtasks for many tasks with a single bulk request", async () => {
        bulkPostMock.mockResolvedValue(
            new Response(
                JSON.stringify({
                    data: {
                        "task-1": [
                            {
                                id: "subtask-1",
                                taskId: "task-1",
                                title: "First",
                                isComplete: false,
                                orderIndex: 2,
                                createdAt: "2026-03-20T00:00:00.000Z",
                            },
                            {
                                id: "subtask-2",
                                taskId: "task-1",
                                title: "Second",
                                isComplete: false,
                                orderIndex: 1,
                                createdAt: "2026-03-20T00:00:00.000Z",
                            },
                        ],
                    },
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );

        const { result } = renderHook(() => useSubtasksByTaskIds(["task-2", "task-1", "task-1"]), {
            wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.data).toBeDefined());

        expect(bulkPostMock).toHaveBeenCalledWith({
            json: { taskIds: ["task-1", "task-2"] },
        });
        expect(result.current.data).toEqual({
            "task-1": [
                expect.objectContaining({ id: "subtask-2", orderIndex: 1 }),
                expect.objectContaining({ id: "subtask-1", orderIndex: 2 }),
            ],
            "task-2": [],
        });
    });
});
