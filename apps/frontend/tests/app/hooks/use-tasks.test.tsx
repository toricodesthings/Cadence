import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTasks } from "../../../app/hooks/tasks/use-tasks";
import { withClient } from "../../helpers";

const taskGetMock = vi.fn();
const useAuthStateMock = vi.fn();

vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { tasks: { $get: taskGetMock } } }),
}));

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => useAuthStateMock(),
}));

describe("useTasks", () => {
    beforeEach(() => {
        taskGetMock.mockReset();
        useAuthStateMock.mockReset().mockReturnValue({ authReady: true, isAuthenticated: true });
    });

    it("does not execute when auth bootstrap is incomplete", () => {
        useAuthStateMock.mockReturnValue({ authReady: false, isAuthenticated: false });

        renderHook(() => useTasks({ state: "ACTIVE" }), { wrapper: withClient() });

        expect(taskGetMock).not.toHaveBeenCalled();
    });

    it("fetches tasks once auth is ready", async () => {
        taskGetMock.mockResolvedValue(Response.json({ data: [{ id: "task-1", title: "T" }] }));

        const { result } = renderHook(() => useTasks({ state: "ACTIVE" }), { wrapper: withClient() });

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
        taskGetMock.mockResolvedValue(Response.json({ data: [] }));

        renderHook(
            () => useTasks({ state: "ACTIVE", hasNoProject: true, effectiveOnOrBeforeDate: "2026-03-09" }),
            { wrapper: withClient() },
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
