import { useRef } from "react";
import { Bell, X } from "lucide-react";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useNotificationCenter } from "../../hooks/notifications/use-notification-center";
import { UtilitySheet } from "../shared/UtilitySheet";
import { Dialog, DialogContent, DialogTitle } from "../primitives/Dialog";
import { Tip } from "../primitives/Tooltip";
import { NotificationCenter } from "./NotificationCenter";

/** Shared notification panel: a dialog on desktop, a sheet in compact shells. */
export function NotificationsSheet() {
    const { notificationsOpen, close, openSettings } = useUtilityNavigation();
    const { isCompact } = useShellMode();
    const notifications = useNotificationCenter();
    const heading = useRef<HTMLHeadingElement>(null);
    const opener = useRef<HTMLElement | null>(null);
    const restoreFocus = useRef(true);
    const content = <NotificationCenter {...notifications} fullPage
        onClose={() => { restoreFocus.current = false; }}
        onOpenSettings={() => { restoreFocus.current = false; openSettings("notifications"); }} />;

    if (isCompact) return <UtilitySheet title="Notifications" open={notificationsOpen} onClose={close} scrollable={false}>{content}</UtilitySheet>;

    return <Dialog open={notificationsOpen} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent hideCloseButton aria-label="Notifications" className="dialog-glow flex flex-col gap-0 overflow-hidden p-5"
            style={{ width: "min(44rem, calc(100vw - 3rem))", maxWidth: "none", height: "min(48rem, calc(100dvh - 4rem))" }}
            onOpenAutoFocus={(event) => {
                event.preventDefault();
                const focused = document.activeElement;
                if (focused instanceof HTMLElement && focused !== document.body && !focused.closest('[role="dialog"]')) opener.current = focused;
                restoreFocus.current = true;
                heading.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (!restoreFocus.current) return;
                const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>("[data-notification-trigger]");
                target?.focus({ preventScroll: true });
            }}>
            <div className="mb-4 flex shrink-0 items-center justify-between gap-3 px-1">
                <DialogTitle ref={heading} tabIndex={-1} className="flex items-center gap-3 font-display text-2xl focus-visible:ring-2 focus-visible:ring-accent-primary">
                    <Bell size={24} className="dialog-glow-icon shrink-0" aria-hidden="true" />Notifications
                </DialogTitle>
                <Tip label="Close notifications"><button type="button" onClick={close} className="mobile-icon-button rounded-full bg-twilight-surface" aria-label="Close notifications"><X size={20} aria-hidden="true" /></button></Tip>
            </div>
            {content}
        </DialogContent>
    </Dialog>;
}
