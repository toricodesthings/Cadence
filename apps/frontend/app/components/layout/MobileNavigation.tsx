import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Bell, Calendar, Inbox, LayoutDashboard, LayoutGrid, Search, Sparkles } from "lucide-react";
import { Tip } from "../primitives/Tooltip";
import { useNotificationCenter } from "../../hooks/notifications/use-notification-center";

import { useAssistantStore } from "../../stores/assistant-store";
import { useUtilityNavigation } from "../../hooks/ui/use-utility-navigation";

const TABS = [
    { to: "/", label: "Capture", icon: Inbox },
    { to: "/today", label: "Today", icon: LayoutDashboard },
    { to: "/schedule", label: "Schedule", icon: Calendar },
    { to: "/browse", label: "Browse", icon: LayoutGrid },
];

export function MobileTabBar() {
    const { pathname } = useLocation();
    const { assistantPanelOpen, toggleAssistantPanel } = useAssistantStore();
    const primary = TABS.slice(0, -1).some((tab) => tab.to === pathname);
    return <nav aria-label="Primary navigation" className="mobile-tab-bar safe-bottom layer-shell-header shrink-0 pt-2">
        <div className="mobile-dock glass mx-auto flex w-full max-w-sm items-stretch gap-1 rounded-full p-1.5">
            {[...TABS.slice(0, 2), null, ...TABS.slice(2)].map((tab) => {
                if (!tab) return <div key="assistant" className="flex flex-1 items-center justify-center"><Tip label="Ask assistant" side="top"><button type="button" aria-label="Ask assistant" aria-haspopup="dialog" aria-expanded={assistantPanelOpen} onClick={toggleAssistantPanel} className="mobile-dock-assistant flex size-13 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent-primary text-midnight transition-transform active:scale-95"><Sparkles size={24} aria-hidden="true" /></button></Tip></div>;
                const { to, label, icon: Icon } = tab;
                const active = pathname === to || (to === "/browse" && !primary);
                return <Tip key={to} label={label} side="top"><Link to={to} aria-current={active ? "page" : undefined} aria-label={label}
                    className={`flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-full transition-colors active:bg-twilight-surface ${active ? "bg-accent-primary/12 text-accent-primary" : "text-twilight-text-soft hover:bg-twilight-surface"}`}>
                    <Icon size={22} strokeWidth={active ? 2.5 : 1.75} className="shrink-0" aria-hidden="true" />
                </Link></Tip>;
            })}
        </div>
    </nav>;
}

export function MobileHeaderActions({ onSearch, children }: { onSearch: () => void; children?: ReactNode }) {
    const { pathname } = useLocation();
    const { hasUnread } = useNotificationCenter();
    const { openNotifications } = useUtilityNavigation();
    return <div className="flex shrink-0 items-center">
        {children}
        {pathname === "/browse" && <Tip label="Search"><button type="button" onClick={onSearch} aria-label="Search" className="mobile-icon-button"><Search size={20} aria-hidden="true" /></button></Tip>}
        <Tip label="Notifications"><button type="button" onClick={openNotifications} aria-label={hasUnread ? "Notifications, unread activity" : "Notifications"} className="mobile-icon-button relative">
            <Bell size={20} aria-hidden="true" />{hasUnread && <span className="absolute right-2 top-2 size-2 rounded-full bg-accent-primary" />}
        </button></Tip>
    </div>;
}
