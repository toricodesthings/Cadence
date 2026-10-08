import { useCallback, useEffect } from "react";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { resolveZone, setUserZone } from "../../lib/utils/user-zone";
import { useSettings } from "./use-settings";
import { WAKE_EVENT } from "./use-wake-refresh";

/**
 * Keeps the app's zone and `users.time_zone` equal to the device's (or the zone Settings pins).
 * Syncs on start, when the page becomes visible again (a laptop that crossed zones, the desktop app
 * resuming from sleep) and when the pin changes. `PUT /me/time-zone` is idempotent and cheap; a failed
 * call is simply retried on the next trigger.
 */
export function useZoneSync() {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    const { data: settings } = useSettings();
    const setting = settings?.dateTime?.timezone;

    const sync = useCallback(async () => {
        const zone = resolveZone(setting);
        setUserZone(zone);
        if (!authReady || !isAuthenticated || !navigator.onLine) return;
        try {
            await unwrapResponse(await client.api.me["time-zone"].$put({ json: { timeZone: zone } }));
        } catch {
            // Offline or a blip: the next start / visibility change tries again.
        }
    }, [client, authReady, isAuthenticated, setting]);

    useEffect(() => {
        void sync();
        const onVisible = () => { if (document.visibilityState === "visible" && (setting === undefined || setting === "device")) void sync(); };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("online", sync);
        window.addEventListener("focus", onVisible); // the desktop app resuming from sleep
        window.addEventListener(WAKE_EVENT, onVisible); // ...or waking while hidden in the tray
        return () => {
            window.removeEventListener(WAKE_EVENT, onVisible);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("online", sync);
            window.removeEventListener("focus", onVisible);
        };
    }, [sync, setting]);
}
