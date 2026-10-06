import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useNotificationCenter } from "../../../app/hooks/notifications/use-notification-center";
import { queryKeys } from "../../../app/lib/api/query-keys";
import { StartupReadyContext } from "../../../app/hooks/core/use-workspace-startup";
import { testQueryClient, withClient } from "../../helpers";

const fixture = vi.hoisted(() => {
    const notification = { id: "read-toggle", kind: "task-due", title: "Review plan", body: "Due today", triggerAt: "2026-09-16T10:00:00Z", entityId: "task1", route: "/today", priority: "high", read: false };
    const auth = { authReady: true, isAuthenticated: true, session: { user: { id: "user-1" } } };
    const post = vi.fn(async ({ json }: { json: Record<string, unknown> }) => ({
        ok: true, status: 201, json: async () => ({ data: {
            id: "state-1", userId: auth.session.user.id, firstPresentedAt: null, lastPresentedAt: null,
            dismissedAt: null, deferredUntil: null, actionTaken: null, presentationCount: 1,
            createdAt: "2026-10-04T00:00:00Z", updatedAt: new Date().toISOString(), ...json,
        } }),
    }));
    return { notification, auth, empty: [], post, client: { api: { settings: { "notification-state": {
        $get: vi.fn(async () => ({ ok: true, json: async () => ({ data: [] as unknown[] }) })), $post: post,
    } } } } };
});
const reads = vi.hoisted(() => ({ tasks: vi.fn(), habits: vi.fn() }));
vi.mock("../../../app/hooks/tasks/use-tasks", () => ({ useTasks: (options: unknown) => { reads.tasks(options); return { data: fixture.empty }; } }));
vi.mock("../../../app/hooks/habits/use-habits", () => ({ useHabitsRange: (options: unknown) => { reads.habits(options); return { data: fixture.empty }; } }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => fixture.auth }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => fixture.client }));
vi.mock("../../../app/lib/api/track-event", () => ({ trackUsageEvent: vi.fn() }));
vi.mock("../../../app/lib/notifications/reminder-engine", async (importOriginal) => ({
    ...await importOriginal<typeof import("../../../app/lib/notifications/reminder-engine")>(),
    deriveCandidates: () => [{ ...fixture.notification }],
}));

beforeEach(() => {
    vi.clearAllMocks();
    fixture.auth.authReady = true;
    fixture.auth.isAuthenticated = true;
    fixture.auth.session.user.id = "user-1";
});

const stateKey = queryKeys.settings.notificationState("user-1");

it("persists read/unread changes locally, syncs their explicit action, and hydrates server unread state", async () => {
    const client = testQueryClient();
    const { result, unmount } = renderHook(() => useNotificationCenter(), { wrapper: withClient(client) });
    await waitFor(() => expect(client.getQueryState(stateKey)?.status).toBe("success"));
    act(() => result.current.markRead("read-toggle"));
    expect(result.current.unreadCount).toBe(0);
    act(() => result.current.markUnread("read-toggle"));
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.notifications[0].read).toBe(false);
    expect(JSON.parse(localStorage.getItem("cadence_notification_state")!).readIds).not.toContain("read-toggle");
    expect(fixture.post).toHaveBeenCalledWith(expect.objectContaining({ json: expect.objectContaining({ triggerId: "read-toggle", actionTaken: "unread" }) }));
    act(() => result.current.markRead("read-toggle"));
    expect(result.current.unreadCount).toBe(0);
    await act(async () => {});
    act(() => client.setQueryData(stateKey, [{ triggerId: "read-toggle", actionTaken: "unread" }]));
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    unmount();
    client.clear();
});


it("shares one presentation write across six surfaces and a remount", async () => {
    const client = testQueryClient();
    const wrapper = withClient(client);
    const hooks = Array.from({ length: 6 }, () => renderHook(() => useNotificationCenter(), { wrapper }));
    await waitFor(() => expect(client.getQueryData(stateKey)).toEqual([
        expect.objectContaining({ triggerId: "read-toggle", firstPresentedAt: expect.any(String) }),
    ]));
    expect(fixture.client.api.settings["notification-state"].$get).toHaveBeenCalledTimes(1);
    expect(fixture.post).toHaveBeenCalledTimes(1);
    expect(fixture.post).toHaveBeenCalledWith({ json: expect.objectContaining({ presentationCountIncrement: 1 }) });
    const payload = fixture.post.mock.calls[0][0].json;
    expect(payload.actionTaken).toBeUndefined();
    expect(payload.dismissedAt).toBeUndefined();
    expect(payload.deferredUntil).toBeUndefined();
    hooks.forEach((hook) => hook.unmount());
    const remounted = renderHook(() => useNotificationCenter(), { wrapper });
    await act(async () => {});
    expect(fixture.post).toHaveBeenCalledTimes(1);
    remounted.unmount();
    client.clear();
});

it("waits for the shared read and skips an already presented reminder", async () => {
    const client = testQueryClient();
    let resolve!: (value: { ok: boolean; json: () => Promise<{ data: unknown[] }> }) => void;
    fixture.client.api.settings["notification-state"].$get.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const hook = renderHook(() => useNotificationCenter(), { wrapper: withClient(client) });
    await act(async () => {});
    expect(fixture.post).not.toHaveBeenCalled();
    await act(async () => resolve({ ok: true, json: async () => ({ data: [{
        triggerId: "read-toggle", firstPresentedAt: "2026-10-01T00:00:00Z", actionTaken: "read",
    }] }) }));
    await waitFor(() => expect(hook.result.current.unreadCount).toBe(0));
    expect(fixture.post).not.toHaveBeenCalled();
    hook.unmount();
    client.clear();
});

it("does not write presentations before authentication is ready", async () => {
    const client = testQueryClient();
    fixture.auth.authReady = false;
    const hook = renderHook(() => useNotificationCenter(), { wrapper: withClient(client) });
    await act(async () => {});
    expect(fixture.post).not.toHaveBeenCalled();
    expect(fixture.client.api.settings["notification-state"].$get).not.toHaveBeenCalled();
    fixture.auth.authReady = true;
    hook.rerender();
    await waitFor(() => expect(fixture.post).toHaveBeenCalledTimes(1));
    hook.unmount();
    client.clear();
});

it("releases a failed presentation claim so a remount can retry", async () => {
    const client = testQueryClient();
    const wrapper = withClient(client);
    fixture.post.mockRejectedValueOnce(new Error("offline"));
    const hook = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(fixture.post).toHaveBeenCalledTimes(1));
    await act(async () => {});
    hook.unmount();
    const retry = renderHook(() => useNotificationCenter(), { wrapper });
    await waitFor(() => expect(fixture.post).toHaveBeenCalledTimes(2));
    retry.unmount();
    client.clear();
});

it("keeps presentation claims and saved rows separate for each account", async () => {
    const client = testQueryClient();
    const hook = renderHook(() => useNotificationCenter(), { wrapper: withClient(client) });
    await waitFor(() => expect(client.getQueryData(stateKey)).toHaveLength(1));
    fixture.auth.session.user.id = "user-2";
    hook.rerender();
    await waitFor(() => expect(client.getQueryData(queryKeys.settings.notificationState("user-2"))).toHaveLength(1));
    expect(fixture.post).toHaveBeenCalledTimes(2);
    hook.unmount();
    client.clear();
});

it("keeps the bell's reads out of startup: nothing loads until the workspace reveals", async () => {
    const client = testQueryClient();
    const Client = withClient(client);
    const hook = renderHook(() => useNotificationCenter(), { wrapper: ({ children }) => <Client><StartupReadyContext value={false}>{children}</StartupReadyContext></Client> });
    await act(async () => {});
    expect(fixture.client.api.settings["notification-state"].$get).not.toHaveBeenCalled();
    expect(reads.tasks).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(reads.habits).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    hook.unmount();
    client.clear();
});
