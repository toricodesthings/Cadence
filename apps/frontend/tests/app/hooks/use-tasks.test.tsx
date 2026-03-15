import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTasks } from "../../../app/hooks/tasks/use-tasks";

const taskGetMock = vi.fn();
const useApiClientMock = vi.fn();
const useAuthStateMock = vi.fn();

vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => useApiClientMock(),
}));

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => useAuthStateMock(),
}));

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}

describe("useTasks", () => {
    beforeEach(() => {
        taskGetMock.mockReset();
        useApiClientMock.mockReset();
        useAuthStateMock.mockReset();
        useApiClientMock.mockReturnValue({
            api: {
                tasks: {
                    $get: taskGetMock,
                },
            },
        });
    });

    it("does not execute when auth bootstrap is incomplete", () => {
        useAuthStateMock.mockReturnValue({
            authReady: false,
            isAuthenticated: false,
        });

        renderHook(() => useTasks({ state: "ACTIVE" }), { wrapper: createWrapper() });

        expect(taskGetMock).not.toHaveBeenCalled();
    });

    it("fetches tasks once auth is ready", async () => {
        useAuthStateMock.mockReturnValue({
            authReady: true,
            isAuthenticated: true,
        });
        taskGetMock.mockResolvedValue(
            new Response(JSON.stringify({ data: [{ id: "task-1", title: "T" }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const { result } = renderHook(() => useTasks({ state: "ACTIVE" }), { wrapper: createWrapper() });

        await waitFor(() => {
            expect(result.current.data).toEqual([{ id: "task-1", title: "T" }]);
        });

        expect(taskGetMock).toHaveBeenCalledWith({
            query: {
                state: "ACTIVE",
            },
        });
    });

    it("serializes extended filters for holding and today views", async () => {
        useAuthStateMock.mockReturnValue({
            authReady: true,
            isAuthenticated: true,
        });
        taskGetMock.mockResolvedValue(
            new Response(JSON.stringify({ data: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        renderHook(
            () => useTasks({ state: "ACTIVE", hasNoProject: true, effectiveOnOrBeforeDate: "2026-03-09" }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(taskGetMock).toHaveBeenCalledWith({
                query: {
                    state: "ACTIVE",
                    hasNoProject: "true",
                    effectiveOnOrBeforeDate: "2026-03-09",
                },
            });
        });
    });
});
