import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const put = vi.fn();
let zone = "America/Toronto";
let userId = "u1";
vi.mock("../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({ api: { me: { "time-zone": { $put: put } } } }) }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => ({ authReady: true, isAuthenticated: true, session: { user: { id: userId } } }) }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("../../../app/lib/utils/user-zone", () => ({ resolveZone: () => zone, setUserZone: vi.fn() }));
vi.mock("../../../app/lib/api/helpers", () => ({ unwrapResponse: async (r: unknown) => r }));

import { useZoneSync } from "../../../app/hooks/core/use-zone-sync";
import { WAKE_EVENT } from "../../../app/hooks/core/use-wake-refresh";

const flush = () => waitFor(() => expect(put).toHaveBeenCalled());

describe("useZoneSync", () => {
    beforeEach(() => { put.mockReset(); put.mockResolvedValue({}); });

    it("writes once per zone and user, however often the window wakes; a failed write is retried", async () => {
        // A fresh module state per test comes from using distinct zones/users.
        zone = "Europe/Paris"; userId = "u1";
        const { unmount } = renderHook(() => useZoneSync());
        await flush();
        expect(put).toHaveBeenCalledTimes(1);

        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new Event(WAKE_EVENT));
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((r) => setTimeout(r));
        expect(put).toHaveBeenCalledTimes(1);
        unmount();

        // Changed zone → write; another user → write.
        zone = "Asia/Tokyo";
        renderHook(() => useZoneSync()).unmount();
        await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
        userId = "u2";
        renderHook(() => useZoneSync()).unmount();
        await waitFor(() => expect(put).toHaveBeenCalledTimes(3));

        // A failed PUT leaves it unsynced, so the next trigger tries again.
        zone = "Australia/Sydney";
        put.mockRejectedValueOnce(new Error("offline"));
        const { unmount: u3 } = renderHook(() => useZoneSync());
        await waitFor(() => expect(put).toHaveBeenCalledTimes(4));
        window.dispatchEvent(new Event("online"));
        await waitFor(() => expect(put).toHaveBeenCalledTimes(5));
        u3();
    });
});
