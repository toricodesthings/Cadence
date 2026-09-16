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
