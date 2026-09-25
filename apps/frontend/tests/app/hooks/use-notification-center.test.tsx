import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useNotificationCenter } from "../../../app/hooks/notifications/use-notification-center";
import { testQueryClient, withClient } from "../../helpers";

const fixture = vi.hoisted(() => {
    const notification = { id: "read-toggle", kind: "task-due", title: "Review plan", body: "Due today", triggerAt: "2026-09-16T10:00:00Z", entityId: "task1", route: "/today", priority: "high", read: false };
    const post = vi.fn(async () => ({ ok: true }));
    return { notification, empty: [], post, client: { api: { settings: { "notification-state": {
        $get: vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })), $post: post,
    } } } } };
});
vi.mock("../../../app/hooks/tasks/use-tasks", () => ({ useTasks: () => ({ data: fixture.empty }) }));
vi.mock("../../../app/hooks/habits/use-habits", () => ({ useHabitsRange: () => ({ data: fixture.empty }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ authReady: true, isAuthenticated: true }) }));
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => fixture.client }));
vi.mock("../../../app/lib/api/track-event", () => ({ trackUsageEvent: vi.fn() }));
vi.mock("../../../app/lib/notifications/reminder-engine", async (importOriginal) => ({
    ...await importOriginal<typeof import("../../../app/lib/notifications/reminder-engine")>(),
    deriveCandidates: () => [{ ...fixture.notification }],
}));

it("persists read/unread changes locally, syncs their explicit action, and hydrates server unread state", async () => {
    const client = testQueryClient();
    const { result, unmount } = renderHook(() => useNotificationCenter(), { wrapper: withClient(client) });
    await waitFor(() => expect(client.getQueryState(["notification-state"])?.status).toBe("success"));
    act(() => result.current.markRead("read-toggle"));
    expect(result.current.unreadCount).toBe(0);
    act(() => result.current.markUnread("read-toggle"));
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.notifications[0].read).toBe(false);
    expect(JSON.parse(localStorage.getItem("cadence_notification_state")!).readIds).not.toContain("read-toggle");
    expect(fixture.post).toHaveBeenCalledWith(expect.objectContaining({ json: expect.objectContaining({ triggerId: "read-toggle", actionTaken: "unread" }) }));
    act(() => result.current.markRead("read-toggle"));
    expect(result.current.unreadCount).toBe(0);
    act(() => client.setQueryData(["notification-state"], [{ triggerId: "read-toggle", actionTaken: "unread" }]));
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    unmount();
    client.clear();
});
