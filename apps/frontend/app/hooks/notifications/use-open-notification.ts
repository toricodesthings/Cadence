import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { buildFocusSearchParams } from "../search/use-route-focus";
import type { AppNotification } from "../../lib/notifications/notification-model";

/** Both notification surfaces follow the same destination and history behavior. */
export function useOpenNotification(markRead: (id: string) => void, onClose: () => void) {
    const navigate = useNavigate();
    const location = useLocation();
    return (notification: AppNotification) => {
        markRead(notification.id);
        if (!notification.route) return;
        const params = notification.entityId ? buildFocusSearchParams({
            focusKind: notification.kind === "habit-reminder" ? "habit" : "task",
            focusId: notification.entityId,
            focusSource: "notification",
        }).toString() : "";
        navigate(`${notification.route}${params ? `?${params}` : ""}`, {
            replace: new URLSearchParams(location.search).has("notifications"),
        });
        onClose();
    };
}

/** A tap on a reminder shown by the service worker (sw.js) lands on its target in the already-open app. */
export function useNotificationTapRouting() {
    const navigate = useNavigate();
    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const { type, route } = (event.data ?? {}) as { type?: string; route?: unknown };
            if (type === "cadence:open" && typeof route === "string" && route.startsWith("/") && !route.startsWith("//")) navigate(route);
        };
        navigator.serviceWorker?.addEventListener("message", onMessage);
        return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
    }, [navigate]);
}
