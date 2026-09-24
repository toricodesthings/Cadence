import { ActivityBadge } from "../primitives/ActivityBadge";
import { useRef, useState } from "react";
import { Bell, Expand } from "lucide-react";
import { useNotificationCenter } from "../../hooks/notifications/use-notification-center";
import { useOpenNotification } from "../../hooks/notifications/use-open-notification";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";
import * as Popover from "../primitives/Popover";
import { Tip } from "../primitives/Tooltip";
import { NotificationRow } from "./NotificationRow";

/** Desktop's quick glance; compact shells open the full sheet directly. */
export function NotificationPreview({ side = "right" }: { side?: "right" | "bottom" }) {
    const [open, setOpen] = useState(false);
    const { notifications, unreadCount, markRead, dismiss } = useNotificationCenter();
    const { openNotifications } = useUtilityNavigation();
    const trigger = useRef<HTMLButtonElement>(null);
    const expanding = useRef(false);
    const handleOpen = useOpenNotification(markRead, () => setOpen(false));
    const recent = [...notifications].sort((a, b) => Date.parse(b.triggerAt) - Date.parse(a.triggerAt)).slice(0, 3);

    return <Popover.Root modal={false} open={open} onOpenChange={setOpen}>
        <Tip label="Notifications" side="right"><Popover.Trigger asChild>
            <button ref={trigger} data-notification-trigger type="button" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                className="btn-icon relative rounded-2xl text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-accent-primary">
                <Bell size={18} aria-hidden="true" />
                {unreadCount > 0 && <ActivityBadge count={unreadCount} className="absolute right-0.5 top-0.5" />}
            </button>
        </Popover.Trigger></Tip>
        <Popover.Content side={side} align="end" className="notification-preview w-80 max-w-[calc(100vw-2rem)] overflow-hidden !p-2" aria-label="Recent notifications"
            onCloseAutoFocus={(event) => {
                if (!expanding.current) return;
                event.preventDefault();
                expanding.current = false;
            }}>
            <div className="flex items-center justify-between gap-2 px-2 py-2">
                <h2 className="text-sm font-semibold text-twilight-text">Notifications</h2>
                {recent.length > 0 && <span className="text-xs tabular-nums text-twilight-text-muted">{unreadCount ? `${unreadCount} unread` : "All caught up"}</span>}
            </div>
            <div className={`max-h-[min(18rem,60dvh)] overflow-y-auto overscroll-contain ${recent.length === 0 || recent.length === 3 ? "h-[min(18rem,60dvh)]" : ""}`}>
            {recent.length ? <ul className="space-y-1">
                {recent.map((notification) => <NotificationRow key={notification.id} notification={notification} compact
                    onOpen={() => handleOpen(notification)} onDismiss={() => { trigger.current?.focus(); dismiss(notification.id); }} />)}
            </ul> : <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-twilight-elevated/60 text-twilight-text-muted">
                    <Bell size={24} strokeWidth={1.5} aria-hidden="true" />
                </span>
                <p className="mt-4 font-display text-lg font-medium text-twilight-text-soft">All caught up.</p>
            </div>}
            </div>
            <button type="button" onClick={() => {
                expanding.current = true;
                trigger.current?.focus();
                setOpen(false);
                openNotifications();
            }} className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border-t border-twilight-border text-sm text-twilight-text-soft transition-colors hover:bg-twilight-surface focus-visible:ring-2 focus-visible:ring-accent-primary cursor-pointer">
                <Expand size={15} aria-hidden="true" />{notifications.length ? `View all ${notifications.length} notifications` : "Open notification panel"}
            </button>
        </Popover.Content>
    </Popover.Root>;
}
