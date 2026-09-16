import { useRef, useState } from "react";
import { Bell, BellRing, Expand } from "lucide-react";
import { useNotificationCenter } from "../../hooks/notifications/use-notification-center";
import { useOpenNotification } from "../../hooks/notifications/use-open-notification";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";
import * as Popover from "../primitives/Popover";
import { Tip } from "../primitives/Tooltip";
import { NotificationRow } from "./NotificationRow";

/** Desktop's quick glance; compact shells open the full sheet directly. */
export function NotificationPreview({ side = "right" }: { side?: "right" | "bottom" }) {
    const [open, setOpen] = useState(false);
    const { notifications, hasUnread, unreadCount, markRead, dismiss } = useNotificationCenter();
    const { openNotifications } = useUtilityNavigation();
    const trigger = useRef<HTMLButtonElement>(null);
    const expanding = useRef(false);
    const handleOpen = useOpenNotification(markRead, () => setOpen(false));
    const recent = [...notifications].sort((a, b) => Date.parse(b.triggerAt) - Date.parse(a.triggerAt)).slice(0, 3);

    return <Popover.Root modal={false} open={open} onOpenChange={setOpen}>
        <Tip label="Notifications" side="right"><Popover.Trigger asChild>
            <button ref={trigger} data-notification-trigger type="button" aria-label={hasUnread ? "Notifications, unread activity" : "Notifications"}
                className="btn-icon relative rounded-2xl text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-accent-primary">
                <Bell size={18} aria-hidden="true" />
                {hasUnread && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent-primary" />}
            </button>
        </Popover.Trigger></Tip>
        <Popover.Content side={side} align="end" className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden !p-2" aria-label="Recent notifications"
            onCloseAutoFocus={(event) => {
                if (!expanding.current) return;
                event.preventDefault();
                expanding.current = false;
            }}>
            <div className="flex items-center justify-between gap-2 px-2 py-2">
                <h2 className="text-sm font-semibold text-twilight-text">Notifications</h2>
                <span className="text-xs tabular-nums text-twilight-text-muted">{unreadCount ? `${unreadCount} unread` : "All caught up"}</span>
            </div>
            {recent.length ? <ul className="max-h-[min(22rem,60dvh)] space-y-1 overflow-y-auto overscroll-contain">
                {recent.map((notification) => <NotificationRow key={notification.id} notification={notification} compact
                    onOpen={() => handleOpen(notification)} onDismiss={() => { trigger.current?.focus(); dismiss(notification.id); }} />)}
            </ul> : <div className="flex items-center gap-2 px-2 py-4 text-sm text-twilight-text-muted"><BellRing size={17} aria-hidden="true" />No new notifications</div>}
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
