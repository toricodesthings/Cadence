import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSubtasksByTaskIds } from "../../../app/hooks/tasks/use-subtasks";

const bulkGetMock = vi.fn();

vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({
        api: {
            subtasks: {
                $get: bulkGetMock,
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
        bulkGetMock.mockReset();
    });

    it("fetches subtasks for many tasks with a single bulk request", async () => {
        bulkGetMock.mockResolvedValue(
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

        expect(bulkGetMock).toHaveBeenCalledWith({
            query: { taskIds: "task-1,task-2" },
        });
        expect(result.current.data).toEqual({
            "task-1": [
                expect.objectContaining({ id: "subtask-2", orderIndex: 1 }),
                expect.objectContaining({ id: "subtask-1", orderIndex: 2 }),
            ],
            "task-2": [],
        });
    });

    it("splits more than 200 tasks into several requests", async () => {
        bulkGetMock.mockImplementation(async () => Response.json({ data: {} }));
        const ids = Array.from({ length: 250 }, (_, i) => `task-${String(i).padStart(3, "0")}`);

        const { result } = renderHook(() => useSubtasksByTaskIds(ids), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(bulkGetMock.mock.calls.map(([{ query }]) => query.taskIds.split(",").length)).toEqual([200, 50]);
        expect(Object.keys(result.current.data!)).toHaveLength(250);
    });
});
