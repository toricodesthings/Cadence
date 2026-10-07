import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "../../../app/lib/notifications/notification-model";

const send = vi.fn();
const state = { status: "local", quiet: false, dismissed: new Set<string>() };

vi.mock("../../../app/platform/runtime", () => ({ sendPlatformNotification: (...args: unknown[]) => send(...args) }));
vi.mock("../../../app/hooks/notifications/use-device-delivery", () => ({
    useDeviceDelivery: () => ({ status: state.status }),
    useDeviceDeliverySync: () => {},
}));
vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: { notifications: { quietHoursEnabled: state.quiet, quietHoursStart: "00:00", quietHoursEnd: "23:59" } } }),
}));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("../../../app/hooks/notifications/use-notification-center", () => ({
    getDismissalState: () => ({ dismissedIds: state.dismissed, deferredUntil: new Map() }),
}));

import { useBrowserNotifications } from "../../../app/hooks/notifications/use-browser-notifications";

const due = (id: string, minutesAgo = 1): AppNotification => {
    const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    return { id, kind: "task-reminder", title: id, body: "b", triggerAt: at, alertAt: at, entityId: "t", route: "/", priority: "high", read: false };
};

beforeEach(() => {
    send.mockReset().mockResolvedValue(undefined);
    Object.assign(state, { status: "local", quiet: false, dismissed: new Set() });
    window.localStorage.clear();
});

describe("useBrowserNotifications (local alerts)", () => {
    it("alerts a due reminder once, even after a reload", () => {
        const list = [due("a")];
        const first = renderHook(() => useBrowserNotifications(list));
        first.rerender();
        expect(send).toHaveBeenCalledTimes(1);
        first.unmount();
        renderHook(() => useBrowserNotifications(list));
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("stays silent when the server already pushes to this device, or alerts are late, dismissed or quiet", () => {
        state.status = "connected";
        renderHook(() => useBrowserNotifications([due("a")]));
        state.status = "local";
        renderHook(() => useBrowserNotifications([due("old", 30)]));
        state.dismissed = new Set(["gone"]);
        renderHook(() => useBrowserNotifications([due("gone")]));
        state.dismissed = new Set();
        state.quiet = true;
        renderHook(() => useBrowserNotifications([due("quiet")]));
        expect(send).not.toHaveBeenCalled();
    });

    it("gives the claim back when a send fails, so the next pass retries", async () => {
        send.mockRejectedValueOnce(new Error("no registration"));
        const list = [due("a")];
        const view = renderHook(({ items }) => useBrowserNotifications(items), { initialProps: { items: list } });
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
        await Promise.resolve();
        view.rerender({ items: [...list] });
        expect(send).toHaveBeenCalledTimes(2);
    });
});
