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

    it("fetches every page for list counts instead of truncating at the API limit", async () => {
        useAuthStateMock.mockReturnValue({ authReady: true, isAuthenticated: true });
        const firstPage = Array.from({ length: 100 }, (_, i) => ({ id: `task-${i}` }));
        taskGetMock
            .mockResolvedValueOnce(Response.json({ data: firstPage }))
            .mockResolvedValueOnce(Response.json({ data: [{ id: "task-100" }] }));
        const { result } = renderHook(() => useTasks({ state: "ACTIVE", allPages: true }), { wrapper: createWrapper() });
        await waitFor(() => expect(result.current.data).toHaveLength(101));
        expect(taskGetMock).toHaveBeenNthCalledWith(1, { query: { state: "ACTIVE", limit: "100", offset: "0" } });
        expect(taskGetMock).toHaveBeenNthCalledWith(2, { query: { state: "ACTIVE", limit: "100", offset: "100" } });
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
