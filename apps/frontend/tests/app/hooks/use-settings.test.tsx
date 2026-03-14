import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings, useUpdateSettings } from "../../../app/hooks/use-settings";
import { SETTINGS_DEFAULTS } from "../../../app/lib/types/settings";

const settingsGetMock = vi.fn();
const settingsPatchMock = vi.fn();
const useApiClientMock = vi.fn();
const useAuthStateMock = vi.fn();

vi.mock("../../../app/hooks/use-api-client", () => ({
    useApiClient: () => useApiClientMock(),
}));

vi.mock("../../../app/hooks/use-auth-state", () => ({
    useAuthState: () => useAuthStateMock(),
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
            mutations: {
                retry: false,
            },
        },
    });
}

function createWrapper(queryClient: QueryClient) {
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}

describe("useSettings", () => {
    beforeEach(() => {
        settingsGetMock.mockReset();
        settingsPatchMock.mockReset();
        useApiClientMock.mockReset();
        useAuthStateMock.mockReset();
        useApiClientMock.mockReturnValue({
            api: {
                settings: {
                    $get: settingsGetMock,
                    $patch: settingsPatchMock,
                },
            },
        });
    });

    it("hydrates from the authenticated user's local cache key", () => {
        localStorage.setItem(
            "cadence_user_settings:user-a",
            JSON.stringify({ tasks: { hideCompleted: true } }),
        );
        useAuthStateMock.mockReturnValue({
            authReady: true,
            isAuthenticated: true,
            session: { user: { id: "user-a" } },
        });
        settingsGetMock.mockResolvedValue(
            new Response(JSON.stringify({ data: { tasks: { hideCompleted: false } } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const queryClient = createQueryClient();
        const { result } = renderHook(() => useSettings(), { wrapper: createWrapper(queryClient) });

        // readLocalCache deep-merges stored values onto SETTINGS_DEFAULTS
        expect(result.current.data).toEqual({
            ...SETTINGS_DEFAULTS,
            tasks: { ...SETTINGS_DEFAULTS.tasks, hideCompleted: true },
        });
    });

    it("writes fetched settings back to the same user-scoped storage key", async () => {
        useAuthStateMock.mockReturnValue({
            authReady: true,
            isAuthenticated: true,
            session: { user: { id: "user-b" } },
        });
        settingsGetMock.mockResolvedValue(
            new Response(JSON.stringify({ data: { tasks: { hideCompleted: false } } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const queryClient = createQueryClient();
        renderHook(() => useSettings(), { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
            expect(localStorage.getItem("cadence_user_settings:user-b")).toBe(
                JSON.stringify({ tasks: { hideCompleted: false } }),
            );
        });
    });

    it("optimistically merges settings updates and rolls back on mutation failure", async () => {
        useAuthStateMock.mockReturnValue({
            authReady: true,
            isAuthenticated: true,
            session: { user: { id: "user-c" } },
        });
        settingsPatchMock.mockResolvedValue(
            new Response(JSON.stringify({ error: { code: "FAIL", message: "Nope" } }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const queryClient = createQueryClient();
        queryClient.setQueryData(["settings", "user-c"], {
            tasks: { hideCompleted: false, hideTrash: false },
        });
        localStorage.setItem(
            "cadence_user_settings:user-c",
            JSON.stringify({ tasks: { hideCompleted: false, hideTrash: false } }),
        );

        const { result } = renderHook(
            () => ({
                mutation: useUpdateSettings(),
                queryClient: useQueryClient(),
            }),
            { wrapper: createWrapper(queryClient) },
        );

        await expect(
            result.current.mutation.mutateAsync({ tasks: { hideCompleted: true } }),
        ).rejects.toMatchObject({ code: "FAIL" });

        await waitFor(() => {
            expect(result.current.queryClient.getQueryData(["settings", "user-c"])).toEqual({
                tasks: { hideCompleted: false, hideTrash: false },
            });
        });
        expect(localStorage.getItem("cadence_user_settings:user-c")).toBe(
            JSON.stringify({ tasks: { hideCompleted: false, hideTrash: false } }),
        );
    });
});
