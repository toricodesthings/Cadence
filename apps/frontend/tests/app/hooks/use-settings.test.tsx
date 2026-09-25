import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    flushAllPendingSettingsMutations,
    useSettings,
    useUpdateSettings,
} from "../../../app/hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../app/types/settings";
import { testQueryClient, withClient } from "../../helpers";

const settingsGetMock = vi.fn();
const settingsPatchMock = vi.fn();
const useAuthStateMock = vi.fn();

vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => ({ api: { settings: { $get: settingsGetMock, $patch: settingsPatchMock } } }),
}));

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => useAuthStateMock(),
}));

function signedInAs(id: string) {
    useAuthStateMock.mockReturnValue({ authReady: true, isAuthenticated: true, session: { user: { id } } });
}

describe("useSettings", () => {
    beforeEach(() => {
        settingsGetMock.mockReset();
        settingsPatchMock.mockReset();
        useAuthStateMock.mockReset();
    });

    it("hydrates from the authenticated user's local cache key", () => {
        localStorage.setItem(
            "cadence_user_settings:user-a",
            JSON.stringify({ tasks: { hideCompleted: true } }),
        );
        signedInAs("user-a");
        settingsGetMock.mockResolvedValue(Response.json({ data: { tasks: { hideCompleted: false } } }));

        const { result } = renderHook(() => useSettings(), { wrapper: withClient() });

        // readLocalCache deep-merges stored values onto SETTINGS_DEFAULTS
        expect(result.current.data).toEqual({
            ...SETTINGS_DEFAULTS,
            tasks: { ...SETTINGS_DEFAULTS.tasks, hideCompleted: true },
        });
    });

    it("writes fetched settings back to the same user-scoped storage key", async () => {
        signedInAs("user-b");
        settingsGetMock.mockResolvedValue(Response.json({ data: { tasks: { hideCompleted: false } } }));

        renderHook(() => useSettings(), { wrapper: withClient() });

        await waitFor(() => {
            expect(localStorage.getItem("cadence_user_settings:user-b")).toBe(
                JSON.stringify({ tasks: { hideCompleted: false } }),
            );
        });
    });

    it("optimistically merges settings updates and rolls back on mutation failure", async () => {
        signedInAs("user-c");
        settingsPatchMock.mockResolvedValue(Response.json({ error: { code: "FAIL", message: "Nope" } }, { status: 500 }));

        const queryClient = testQueryClient();
        queryClient.setQueryData(["settings", "user-c"], {
            tasks: { hideCompleted: false, hideTrash: false },
        });
        localStorage.setItem(
            "cadence_user_settings:user-c",
            JSON.stringify({ tasks: { hideCompleted: false, hideTrash: false } }),
        );

        const { result } = renderHook(() => useUpdateSettings(), { wrapper: withClient(queryClient) });

        await expect(
            result.current.mutateAsync({ tasks: { hideCompleted: true } }),
        ).rejects.toMatchObject({ code: "FAIL" });

        await waitFor(() => {
            expect(queryClient.getQueryData(["settings", "user-c"])).toEqual({
                tasks: { hideCompleted: false, hideTrash: false },
            });
        });
        expect(localStorage.getItem("cadence_user_settings:user-c")).toBe(
            JSON.stringify({ tasks: { hideCompleted: false, hideTrash: false } }),
        );
    });

    it("flushes pending settings mutations when the hook unmounts", async () => {
        signedInAs("user-d");
        settingsPatchMock.mockResolvedValue(Response.json({ data: { tasks: { hideCompleted: true } } }));

        const queryClient = testQueryClient();
        queryClient.setQueryData(["settings", "user-d"], SETTINGS_DEFAULTS);

        const { result, unmount } = renderHook(() => useUpdateSettings(), { wrapper: withClient(queryClient) });

        act(() => {
            result.current.mutate({ tasks: { hideCompleted: true } });
        });

        unmount();

        await waitFor(() => {
            expect(settingsPatchMock).toHaveBeenCalledWith({
                json: { tasks: { hideCompleted: true } },
            });
        });
    });

    it("flushes all registered pending settings mutations on demand", async () => {
        signedInAs("user-e");
        settingsPatchMock.mockResolvedValue(Response.json({ data: { notifications: { email: false } } }));

        const queryClient = testQueryClient();
        queryClient.setQueryData(["settings", "user-e"], SETTINGS_DEFAULTS);

        const { result } = renderHook(() => useUpdateSettings(), { wrapper: withClient(queryClient) });

        act(() => {
            result.current.mutate({ notifications: { email: false } });
        });

        await flushAllPendingSettingsMutations();

        expect(settingsPatchMock).toHaveBeenCalledWith({
            json: { notifications: { email: false } },
        });
    });
});
