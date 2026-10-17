import { useRoutineDueCount } from "../../hooks/habits/use-routine-due-count";
import { ActivityBadge } from "../primitives/ActivityBadge";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Bell, Calendar, Flame, Inbox, LayoutGrid, Search } from "lucide-react";
import { AssistantSigil } from "../assistant/AssistantSigil";
import { Tip } from "../primitives/Tooltip";
import { useNotificationCenter } from "../../hooks/notifications/use-notification-center";

import { useAssistantStore } from "../../stores/assistant-store";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";
import { useLensScrub } from "../../hooks/ui/use-lens-scrub";

// Today, Upcoming and Projects live in the Capture page's workspace menu, so
// the dock keeps the four surfaces you switch between, not the ones you filter.
const TABS = [
    { to: "/", label: "Capture", icon: Inbox },
    { to: "/schedule", label: "Schedule", icon: Calendar },
    { to: "/routines", label: "Routines", icon: Flame },
    { to: "/browse", label: "Browse", icon: LayoutGrid },
];

export function MobileTabBar() {
    const routineDueCount = useRoutineDueCount();
    const { pathname } = useLocation();
    const { assistantPanelOpen, toggleAssistantPanel, replyUnread } = useAssistantStore();
    const unread = replyUnread && !assistantPanelOpen;
    const primary = TABS.slice(0, -1).some((tab) => tab.to === pathname);
    const activeIndex = TABS.findIndex((tab) => pathname === tab.to || (tab.to === "/browse" && !primary));
    const navigate = useNavigate();
    // The lens is the active indicator: it glides on a route change, and on touch scrubs under the finger.
    const { trackRef, lens, handlers, hoverIndex, held } = useLensScrub({ activeIndex, onCommit: (i) => navigate(TABS[i].to), rememberAs: "dock" });
    return <nav aria-label="Primary navigation" className="mobile-tab-bar safe-bottom layer-shell-header shrink-0 pt-2">
        <div ref={trackRef} {...handlers} data-held={held || undefined} className="mobile-dock glass glass-edge relative mx-auto flex w-full max-w-sm touch-none items-stretch gap-1 rounded-full p-1.5">
            <motion.span aria-hidden="true" className="dock-lens glass-edge pointer-events-none absolute inset-y-1.5 left-0 rounded-full" style={{ x: lens.x, width: lens.width, scale: lens.scale }} />
            {[...TABS.slice(0, 2), null, ...TABS.slice(2)].map((tab) => {
                if (!tab) return <div key="assistant" data-lens-exclude className="relative flex flex-1 items-center justify-center"><Tip label="Ask assistant" side="top"><button type="button" aria-label={unread ? "Ask assistant, new reply" : "Ask assistant"} aria-haspopup="dialog" aria-expanded={assistantPanelOpen} onClick={toggleAssistantPanel} className="mobile-dock-assistant flex size-13 shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill press"><AssistantSigil size={30} notice={unread} /></button></Tip></div>;
                const { to, label, icon: Icon } = tab;
                const index = TABS.indexOf(tab);
                const active = index === activeIndex;
                const lit = hoverIndex === null ? active : hoverIndex === index;
                return <Tip key={to} label={label} side="top"><Link to={to} data-lens-item aria-current={active ? "page" : undefined} aria-label={to === "/routines" && routineDueCount > 0 ? `${label}, ${routineDueCount} due today` : label}
                    className={`dock-link relative flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-full transition-colors ${lit ? "text-accent-primary" : "text-twilight-text-soft hover:bg-twilight-surface"}`}>
                    <span className="relative">
                        <Icon size={22} strokeWidth={active ? 2.5 : 1.75} className="shrink-0" aria-hidden="true" />
                        {to === "/routines" && routineDueCount > 0 && <ActivityBadge count={routineDueCount} className="absolute -right-2 -top-2" />}
                    </span>
                </Link></Tip>;
            })}
        </div>
    </nav>;
}

export function MobileHeaderActions({ onSearch, children }: { onSearch: () => void; children?: ReactNode }) {
    const { pathname } = useLocation();
    const { unreadCount } = useNotificationCenter();
    const { openNotifications } = useUtilityNavigation();
    return <div className="flex shrink-0 items-center gap-2">
        {children}
        {pathname === "/browse" && <Tip label="Search"><button type="button" onClick={onSearch} aria-label="Search" className="mobile-icon-button"><Search size={20} aria-hidden="true" /></button></Tip>}
        <Tip label="Notifications"><button type="button" onClick={openNotifications} aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"} className="mobile-icon-button relative">
            <Bell size={20} aria-hidden="true" />{unreadCount > 0 && <ActivityBadge count={unreadCount} className="absolute right-1 top-1" />}
        </button></Tip>
    </div>;
}
