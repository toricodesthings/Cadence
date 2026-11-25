import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Habit } from "@cadence/contracts/habit";
import { UndoneError } from "../../../app/lib/utils/undo-toast";
import { queryKeys } from "../../../app/lib/api/query-keys";

const mocks = vi.hoisted(() => ({
    undoWindow: vi.fn(),
    toastError: vi.fn(),
    deleteMember: vi.fn(),
    postCheer: vi.fn(),
}));

vi.mock("../../../app/lib/utils/undo-toast", async (orig) => {
    const actual = await orig<typeof import("../../../app/lib/utils/undo-toast")>();
    return { ...actual, undoWindow: (...args: unknown[]) => mocks.undoWindow(...args) };
});
vi.mock("../../../app/lib/utils/error-toast", () => ({
    toastError: (...args: unknown[]) => mocks.toastError(...args),
}));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({
        authReady: true,
        isAuthenticated: true,
        session: { user: { id: "22222222-2222-4222-8222-222222222222" } },
    }),
}));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({
        api: {
            habits: {
                ":id": {
                    members: { ":userId": { $delete: mocks.deleteMember } },
                    cheers: { $post: mocks.postCheer },
                },
            },
        },
    }),
}));

import { useCheer, useLeaveRoutine } from "../../../app/hooks/sharing/use-share-routine";

describe("useLeaveRoutine & useCheer Undo handling", () => {
    beforeEach(() => {
        mocks.undoWindow.mockReset();
        mocks.toastError.mockReset();
        mocks.deleteMember.mockReset();
        mocks.postCheer.mockReset();
    });

    it("hides the routine immediately on leave, restores it silently on Undo, and never calls the server", async () => {
        let rejectUndo!: (err: unknown) => void;
        mocks.undoWindow.mockReturnValue(
            new Promise<void>((_resolve, reject) => {
                rejectUndo = reject;
            }),
        );
        const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
        const key = queryKeys.habits.weekly({ start: "2026-11-24", end: "2026-11-24" });
        const initial = [{ id: "h1", title: "Yoga" } as Habit];
        queryClient.setQueryData(key, initial);
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );

        const { result } = renderHook(() => useLeaveRoutine(), { wrapper });
        act(() => {
            result.current.mutate({ habitId: "h1", title: "Yoga" });
        });

        await waitFor(() => expect(queryClient.getQueryData(key)).toEqual([]));

        act(() => {
            rejectUndo(new UndoneError());
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(queryClient.getQueryData(key)).toEqual(initial);
        expect(mocks.deleteMember).not.toHaveBeenCalled();
        expect(mocks.toastError).not.toHaveBeenCalled();
    });

    it("cancels a cheer silently on Undo without showing an error toast", async () => {
        mocks.undoWindow.mockRejectedValue(new UndoneError());
        const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );

        const { result } = renderHook(() => useCheer(), { wrapper });
        act(() => {
            result.current.mutate({ habitId: "h1", title: "Yoga", targetDate: "2026-11-24" });
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(mocks.postCheer).not.toHaveBeenCalled();
        expect(mocks.toastError).not.toHaveBeenCalled();
    });
});
