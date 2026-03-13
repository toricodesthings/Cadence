import { useCallback, useEffect, useRef } from "react";
import { useSettings, useUpdateSettings } from "./use-settings";
import type { AppNotification } from "../lib/notifications/notification-model";

export type NotificationPermission = "default" | "granted" | "denied";

/**
 * Check if the current time falls within quiet hours.
 * Handles midnight crossing (e.g. 22:00 → 07:00).
 */
function isInQuietHours(
    now: Date,
    enabled: boolean,
    start: string | null,
    end: string | null,
): boolean {
    if (!enabled || !start || !end) return false;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const current = now.getHours() * 60 + now.getMinutes();
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    if (startMin <= endMin) {
        // Same-day range (e.g. 09:00 → 17:00)
        return current >= startMin && current < endMin;
    }
    // Crosses midnight (e.g. 22:00 → 07:00)
    return current >= startMin || current < endMin;
}

/**
 * Returns the current browser Notification permission state.
 * Safe for SSR (returns "default" when Notification API is unavailable).
 */
export function getBrowserPermission(): NotificationPermission {
    if (typeof window === "undefined" || !("Notification" in window)) return "default";
    return Notification.permission as NotificationPermission;
}

/**
 * Browser notification hook for foreground reminders.
 *
 * - Manages permission request flow
 * - Deduplicates notifications so the same reminder doesn't fire twice per session
 * - Only fires when the `browser` setting is enabled
 */
export function useBrowserNotifications(notifications: AppNotification[]) {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const firedRef = useRef(new Set<string>());

    const browserEnabled = settings?.notifications?.browser ?? false;
    const quietHoursEnabled = settings?.notifications?.quietHoursEnabled ?? false;
    const quietHoursStart = settings?.notifications?.quietHoursStart ?? null;
    const quietHoursEnd = settings?.notifications?.quietHoursEnd ?? null;
    const permission = getBrowserPermission();

    const requestPermission = useCallback(async () => {
        if (typeof window === "undefined" || !("Notification" in window)) return "denied" as const;
        const result = await Notification.requestPermission();
        // If user granted permission, also enable the setting
        if (result === "granted") {
            updateSettings.mutate({ notifications: { browser: true } });
        }
        return result as NotificationPermission;
    }, [updateSettings]);

    // Fire browser notifications for new items
    useEffect(() => {
        if (!browserEnabled || permission !== "granted") return;
        if (isInQuietHours(new Date(), quietHoursEnabled, quietHoursStart, quietHoursEnd)) return;

        const now = Date.now();
        for (const n of notifications) {
            // Skip already-fired
            if (firedRef.current.has(n.id)) continue;

            const triggerTime = new Date(n.triggerAt).getTime();
            // Only fire for notifications that triggered within the last 5 minutes
            if (now - triggerTime > 5 * 60_000) continue;
            // Don't fire for future notifications
            if (triggerTime > now) continue;

            firedRef.current.add(n.id);

            // Use the Web Notification API
            const notif = new Notification(n.title, {
                body: n.body,
                icon: "/logo.png",
                tag: n.id, // browser-level dedup
                silent: false,
            });

            // Auto-close after 8 seconds
            setTimeout(() => notif.close(), 8_000);
        }
    }, [notifications, browserEnabled, permission, quietHoursEnabled, quietHoursStart, quietHoursEnd]);

    return {
        /** Whether the user has enabled browser notifications in settings */
        browserEnabled,
        /** Current browser permission state */
        permission,
        /** Request browser notification permission (also enables the setting on grant) */
        requestPermission,
    };
}
