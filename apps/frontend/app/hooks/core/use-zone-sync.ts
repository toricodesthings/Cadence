import { useCallback, useEffect } from "react";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { resolveZone, setUserZone } from "../../lib/utils/user-zone";
import { useSettings } from "./use-settings";
import { WAKE_EVENT } from "./use-wake-refresh";

/**
 * Keeps the app's zone and `users.time_zone` equal to the device's (or the zone Settings pins).
 * Checks on start, when the page becomes visible again (a laptop that crossed zones, the desktop app
 * resuming from sleep) and when the pin changes, but only writes when the zone differs from the last one
 * this app instance stored: a write wakes the database. A failed call is retried on the next trigger.
 */
let synced: { userId: string | undefined; zone: string } | null = null;

export function useZoneSync() {
    const client = useApiClient();
    const { authReady, isAuthenticated, session } = useAuthState();
    const { data: settings } = useSettings();
    const setting = settings?.dateTime?.timezone;

    const sync = useCallback(async () => {
        const zone = resolveZone(setting);
        setUserZone(zone);
        if (!authReady || !isAuthenticated || !navigator.onLine) return;
        const userId = session?.user.id;
        if (synced && synced.userId === userId && synced.zone === zone) return;
        try {
            await unwrapResponse(await client.api.me["time-zone"].$put({ json: { timeZone: zone } }));
            synced = { userId, zone };
        } catch {
            // Offline or a blip: the next start / visibility change tries again.
        }
    }, [client, authReady, isAuthenticated, session?.user.id, setting]);

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
