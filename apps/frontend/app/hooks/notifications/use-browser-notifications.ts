import { useEffect, useRef } from "react";
import { dueAlert } from "@cadence/domain/reminders";
import { useSettings } from "../core/use-settings";
import { useAuthState } from "../auth/use-auth-state";
import type { AppNotification } from "../../lib/notifications/notification-model";
import { getUserZone } from "../../lib/utils/user-zone";
import { sendPlatformNotification } from "../../platform/runtime";
import { getDismissalState } from "./use-notification-center";
import { useDeviceDelivery, useDeviceDeliverySync } from "./use-device-delivery";

const FIRED_KEY = "cadence_alerted_occurrences";
const FIRED_LIMIT = 300;

/** Occurrences this device already alerted, per account, so a reload never repeats one. */
function loadFired(userId: string): Set<string> {
    try {
        const saved = JSON.parse(window.localStorage.getItem(FIRED_KEY) ?? "null") as { userId?: string; keys?: string[] } | null;
        return new Set(saved?.userId === userId && Array.isArray(saved.keys) ? saved.keys : []);
    } catch {
        return new Set();
    }
}

function saveFired(userId: string, fired: Set<string>) {
    try {
        window.localStorage.setItem(FIRED_KEY, JSON.stringify({ userId, keys: [...fired].slice(-FIRED_LIMIT) }));
    } catch {
        // Best effort: a reload may repeat an alert, never lose one.
    }
}

/**
 * Local reminder alerts for a device the server can't reach (Cadence shows them itself while it is
 * running): desktop, and browsers without a saved push registration. A connected device is served by
 * the server's push, so this stays silent there. Same policy as the server: `dueAlert`.
 */
export function useBrowserNotifications(notifications: AppNotification[]) {
    useDeviceDeliverySync();
    const { status } = useDeviceDelivery();
    const { data: settings } = useSettings();
    const userId = useAuthState().session?.user.id;
    const firedRef = useRef<{ userId: string; keys: Set<string> } | null>(null);

    const quietHoursEnabled = settings?.notifications?.quietHoursEnabled ?? false;
    const quietHoursStart = settings?.notifications?.quietHoursStart ?? null;
    const quietHoursEnd = settings?.notifications?.quietHoursEnd ?? null;
    const pausedUntil = settings?.notifications?.pausedUntil ?? null;

    useEffect(() => {
        if (status !== "local" || !userId) return;
        if (firedRef.current?.userId !== userId) firedRef.current = { userId, keys: loadFired(userId) };
        const fired = firedRef.current.keys;
        const dismissal = getDismissalState();
        const now = new Date();
        const zone = getUserZone();

        for (const n of notifications) {
            const due = dueAlert(n, {
                now, zone,
                quietHours: { enabled: quietHoursEnabled, start: quietHoursStart, end: quietHoursEnd },
                pausedUntil,
                dismissed: dismissal.dismissedIds.has(n.id),
                deferredUntil: dismissal.deferredUntil.get(n.id),
            });
            if (!due || fired.has(due.key)) continue;

            // Claim before sending so overlapping runs can't double up; a failed send gives the claim back.
            fired.add(due.key);
            saveFired(userId, fired);
            // The occurrence key is the tag the server pushes with, so a local alert and a pushed one collapse into one.
            sendPlatformNotification({ title: n.title, body: n.body, icon: "/logo.png", route: n.route ?? undefined, tag: due.key }).catch(() => {
                fired.delete(due.key);
                saveFired(userId, fired);
            });
        }
    }, [notifications, status, userId, quietHoursEnabled, quietHoursStart, quietHoursEnd, pausedUntil]);
}
