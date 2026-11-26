import { useCallback, useEffect } from "react";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { resolveZone, setUserZone } from "../../lib/utils/user-zone";
import { useSettings } from "./use-settings";
import { WAKE_EVENT } from "./use-wake-refresh";

const RESYNC_MS = 60 * 60_000;
let synced: { userId: string | undefined; zone: string; at: number } | null = null;

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
        if (synced && synced.userId === userId && synced.zone === zone && Date.now() - synced.at < RESYNC_MS) return;
        try {
            await unwrapResponse(await client.api.me["time-zone"].$put({ json: { timeZone: zone } }));
            synced = { userId, zone, at: Date.now() };
        } catch {}
    }, [client, authReady, isAuthenticated, session?.user.id, setting]);

    useEffect(() => {
        void sync();
        const onVisible = () => {
            if (document.visibilityState === "visible" && (setting === undefined || setting === "device")) void sync();
        };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("online", sync);
        window.addEventListener("focus", onVisible);
        window.addEventListener(WAKE_EVENT, onVisible);
        return () => {
            window.removeEventListener(WAKE_EVENT, onVisible);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("online", sync);
            window.removeEventListener("focus", onVisible);
        };
    }, [sync, setting]);
}
