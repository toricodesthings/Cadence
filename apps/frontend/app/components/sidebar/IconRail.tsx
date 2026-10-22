import { weekdayOf } from "@cadence/domain/time";
import { today } from "../../lib/utils/user-zone";
import { ActivityBadge } from "../primitives/ActivityBadge";
import { useCaptureFeed } from "../../hooks/inbox/use-capture-feed";
import {
    Search, Plus, Settings, Flame, Calendar, CalendarHeart, Inbox, Sprout, LogOut, LifeBuoy, Sparkles, RefreshCw, Info, ShieldCheck, FileText, History,
} from "lucide-react";

import { Link, useLocation, useNavigate } from "react-router";

import * as DropdownMenu from "../primitives/DropdownMenu";
import { Tip } from "../primitives";
import { toast } from "sonner";
import { useWorkspaceSync } from "../../hooks/core/use-workspace-sync";
import { useRoutineDueCount } from "../../hooks/habits/use-routine-due-count";
import { NotificationPreview } from "../notifications/NotificationPreview";
import { formatTime } from "../../lib/utils/date-format";
import { useAdminCapabilities } from "../../hooks/auth/use-admin-capabilities";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useSignOut } from "../../hooks/auth/use-sign-out";
import { useAssistantStore } from "../../stores/assistant-store";
import { CADENCE_PRIVACY_URL, CADENCE_TERMS_URL } from "../../lib/constants/app-info";
import { openExternalUrl } from "../../platform/runtime";
import { cn } from "../../lib/utils";
import { DeveloperTools } from "./DeveloperTools";

/** Nav item accent color definitions — per-concept wayfinding shades */
const NAV_LINKS = [
    {
        to: "/",
        icon: Inbox,
        label: "Capture",
        activeColor: "text-accent-nav-capture",
        activeBg: "bg-accent-nav-capture/15 glow-accent",
        hoverColor: "hover:text-accent-nav-capture/70",
        hoverBg: "hover:bg-accent-nav-capture/8 hover:glow-accent",
        notificationFn: undefined,
    },
    {
        to: "/schedule",
        icon: Calendar,
        label: "Schedule",
        activeColor: "text-accent-nav-schedule",
        activeBg: "bg-accent-nav-schedule/15 glow-accent",
        hoverColor: "hover:text-accent-nav-schedule/70",
        hoverBg: "hover:bg-accent-nav-schedule/8 hover:glow-accent",
        notificationFn: undefined,
    },
    {
        to: "/events",
        icon: CalendarHeart,
        label: "Events",
        activeColor: "text-accent-nav-schedule",
        activeBg: "bg-accent-nav-schedule/15 glow-accent",
        hoverColor: "hover:text-accent-nav-schedule/70",
        hoverBg: "hover:bg-accent-nav-schedule/8 hover:glow-accent",
        notificationFn: undefined,
    },
    {
        to: "/routines",
        icon: Flame,
        label: "Routines",
        activeColor: "text-accent-nav-habits",
        activeBg: "bg-accent-nav-habits/15 glow-accent",
        hoverColor: "hover:text-accent-nav-habits/70",
        hoverBg: "hover:bg-accent-nav-habits/8 hover:glow-accent",
        notificationFn: undefined,
    },
    {
        to: "/weekly-review",
        icon: Sprout,
        label: "Weekly Reset",
        activeColor: "text-accent-nav-upcoming",
        activeBg: "bg-accent-nav-upcoming/15 glow-accent",
        hoverColor: "hover:text-accent-nav-upcoming/70",
        hoverBg: "hover:bg-accent-nav-upcoming/8 hover:glow-accent",
        notificationFn: () => weekdayOf(today()) === 1, // subtle dot if Monday
    },
] as const;

const PROFILE_SUPPORT_LINKS: Array<{
    label: string;
    icon: typeof Info;
    to?: string;
    /** Leaves the app: opens in the browser (the legal pages live on the landing site). */
    href?: string;
    settingsTab?: "about";
}> = [
    { settingsTab: "about", icon: Info, label: "About" },
    { to: "/changelog", icon: History, label: "Changelog" },
    { href: CADENCE_PRIVACY_URL, icon: ShieldCheck, label: "Privacy Policy" },
    { href: CADENCE_TERMS_URL, icon: FileText, label: "Terms of Service" },
    { to: "/help-feedback", icon: LifeBuoy, label: "Help & Feedback" },
];

/** The narrow icon rail on the left of the sidebar */
export function IconRail({
    onSearchOpen,
    onQuickAddOpen,
    onAssistantOpen,
    className,
}: {
    onSearchOpen?: () => void;
    onQuickAddOpen?: () => void;
    onAssistantOpen?: () => void;
    className?: string;
}) {
    const { count: captureCount } = useCaptureFeed();
    const location = useLocation();
    const navigate = useNavigate();
    const { session, authReady } = useAuthState();
    const { signOut, dialog: signOutDialog } = useSignOut();
    const { data: adminCapabilities } = useAdminCapabilities();
    const canUseDeveloperTools = adminCapabilities?.canUseDeveloperTools ?? false;

    const { assistantPanelOpen, toggleAssistantPanel, replyUnread } = useAssistantStore();

    const routineDueCount = useRoutineDueCount();

    return (
        <div
            className={cn("flex h-full w-[60px] flex-col items-center gap-1 border-r border-twilight-border py-3 shrink-0 [&>*]:shrink-0", className)}
            role="navigation"
            aria-label="Icon navigation rail"
        >
            {/* Logo */}
            <div
                className="size-10 flex items-center justify-center mb-0.5"
                aria-label="Cadence"
            >
                <img src="/logo.png" alt="Cadence" className="size-full object-cover" />
            </div>

            <div className="w-[60%] h-px bg-twilight-border rounded-full my-0.5" aria-hidden="true" />

            {/* Primary nav links */}
            <nav aria-label="Primary navigation" className="flex flex-col items-center gap-1 w-full px-2">
                {NAV_LINKS.map(({ to, icon: Icon, label, activeColor, activeBg, hoverColor, hoverBg, notificationFn }) => {
                    const isActive = location.pathname === to;
                    const showDot = to !== "/routines" && notificationFn?.();
                    const count = to === "/" ? captureCount : to === "/routines" ? routineDueCount : 0;
                    return (
                        <Tip key={to} label={label} side="right">
                            <Link
                                to={to}
                                aria-label={to === "/routines" && count > 0 ? `${label}, ${count} due today` : to === "/" ? `${label}, ${count} items` : label}
                                aria-current={isActive ? "page" : undefined}
                                className={`
                                    btn-icon relative rounded-2xl transition-colors outline-none
                                    ${isActive
                                        ? `${activeColor} ${activeBg}`
                                        : `text-twilight-text-muted ${hoverColor} ${hoverBg}`
                                    }
                                `}
                            >
                                <Icon size={18} aria-hidden="true" />
                                {count > 0 && <ActivityBadge count={count} className="absolute -right-1 -top-1" />}
                                {showDot && !isActive && (
                                    <ActivityBadge className="absolute right-1 top-1" />
                                )}
                            </Link>
                        </Tip>
                    );
                })}
            </nav>

            <div className="w-[60%] h-px bg-twilight-border rounded-full my-0.5" aria-hidden="true" />

            <Tip label="Ask Assistant" side="right">
                <button
                    onClick={onAssistantOpen ?? toggleAssistantPanel}
                    aria-label={replyUnread ? "Toggle AI Assistant Panel, new reply" : "Toggle AI Assistant Panel"}
                    className={`
                        btn-icon relative rounded-2xl transition-all duration-200 outline-none
                        ${assistantPanelOpen 
                            ? "text-accent-primary bg-accent-primary/10 border border-accent-primary/20 glow-lantern shadow-[0_0_16px_rgba(230,165,85,0.15)]" 
                            : "text-twilight-text-muted hover:text-accent-primary hover:bg-white/[0.04]"
                        }
                    `}
                >
                    <Sparkles size={18} aria-hidden="true" className={assistantPanelOpen ? "animate-pulse" : ""} />
                    {replyUnread && !assistantPanelOpen && <ActivityBadge className="absolute right-1 top-1" />}
                </button>
            </Tip>

            <Tip label="Search" side="right">
                <button
                    onClick={onSearchOpen}
                    aria-label="Search"
                    className="btn-icon rounded-2xl text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] outline-none"
                >
                    <Search size={18} aria-hidden="true" />
                </button>
            </Tip>

            <Tip label="Quick add" side="right">
                <button
                    onClick={onQuickAddOpen}
                    aria-label="Quick add task"
                    className="btn-icon rounded-2xl text-twilight-text-muted hover:text-accent-primary hover:bg-accent-primary-dim outline-none"
                >
                    <Plus size={18} aria-hidden="true" />
                </button>
            </Tip>

            <SyncButton />

            <div className="flex-1" />

            <NotificationPreview />

            <Tip label="Settings" side="right">
                <button
                    onClick={() => navigate("?settings=account")}
                    aria-label="Settings"
                    className="btn-icon rounded-2xl text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] outline-none"
                >
                    <Settings size={18} aria-hidden="true" />
                </button>
            </Tip>

            {canUseDeveloperTools ? <DeveloperTools /> : null}

            {/* Profile avatar */}
            <div className="w-[40%] h-px bg-twilight-border my-1 rounded-full opacity-50" aria-hidden="true" />
            {!authReady ? (
                <div className="w-8 h-8 rounded-full border-2 border-accent-primary border-t-transparent animate-spin opacity-50" />
            ) : session ? (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            aria-label="Profile menu"
                            className="touch-target w-11 h-11 rounded-full bg-accent-primary/10 ring-1 ring-twilight-border overflow-hidden cursor-pointer hover:ring-accent-primary/30 transition-colors flex items-center justify-center"
                        >
                            {session.user.image ? (
                                <img src={session.user.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-accent-primary text-xs font-semibold font-display">
                                    {(session.user.name || session.user.email || "U")[0].toUpperCase()}
                                </span>
                            )}
                        </button>
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Content
                        side="right"
                        sideOffset={12}
                        align="end"
                        className="w-[300px] bg-twilight-surface/95 backdrop-blur-xl border border-twilight-border rounded-2xl shadow-2xl p-2 z-50 text-twilight-text data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:slide-in-from-left-2 data-[state=closed]:slide-out-to-left-2 duration-300"
                    >
                        {/* Profile card header */}
                        <div className="flex flex-col items-center justify-center p-4 pb-3">
                            <div className="w-20 h-20 rounded-full bg-accent-primary/10 ring-1 ring-twilight-border mb-3 overflow-hidden flex items-center justify-center">
                                {session.user.image ? (
                                    <img src={session.user.image} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-accent-primary text-3xl font-semibold font-display">
                                        {(session.user.name || session.user.email || "U")[0].toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <h3 className="text-base font-medium text-twilight-text mb-0.5">
                                {session.user.name || "Adventurer"}
                            </h3>
                            <p className="text-sm text-twilight-text-muted">
                                {session.user.email}
                            </p>
                        </div>

                        <DropdownMenu.Separator className="bg-twilight-border-light" />

                        <div className="p-1">
                            <DropdownMenu.Item className="flex items-center gap-3 px-3 py-2.5 text-[15px] rounded-lg hover:bg-white/5 cursor-pointer outline-none transition-colors" onSelect={() => navigate("?settings=account")}>
                                <Settings size={16} className="text-twilight-text-muted" aria-hidden="true" />
                                <span>Preferences</span>
                            </DropdownMenu.Item>
                            {PROFILE_SUPPORT_LINKS.map(({ to, href, settingsTab, icon: Icon, label }) => (
                                <DropdownMenu.Item
                                    key={to ?? href ?? settingsTab}
                                    className="flex items-center gap-3 px-3 py-2.5 text-[15px] rounded-lg hover:bg-white/5 cursor-pointer outline-none transition-colors"
                                    onSelect={() => {
                                        if (href) void openExternalUrl(href);
                                        else navigate(settingsTab ? `?settings=${settingsTab}` : to!);
                                    }}
                                >
                                    <Icon size={16} className="text-twilight-text-muted" aria-hidden="true" />
                                    <span>{label}</span>
                                </DropdownMenu.Item>
                            ))}
                        </div>

                        <DropdownMenu.Separator className="bg-twilight-border-light" />

                        <div className="p-1">
                            <DropdownMenu.Item
                                onSelect={() => {
                                    void signOut().catch((error: unknown) => {
                                        toast.error(
                                            error instanceof Error
                                                ? error.message
                                                : "Couldn’t sign out right now.",
                                        );
                                    });
                                }}
                                variant="danger"
                                className="flex items-center gap-3"
                            >
                                <LogOut size={16} aria-hidden="true" />
                                <span>Sign out</span>
                            </DropdownMenu.Item>
                        </div>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            ) : (
                <Tip label="Sign in" side="right">
                    <Link
                        to="/auth/sign-in"
                        aria-label="Sign in"
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-twilight-text-muted hover:text-accent-primary hover:bg-accent-primary-dim transition-colors cursor-pointer outline-none"
                    >
                        <LogOut size={18} aria-hidden="true" />
                    </Link>
                </Tip>
            )}
            {signOutDialog}
        </div>
    );
}

/** Sync button with rotating icon while syncing */
function SyncButton() {
    const { sync, isSyncing, lastSyncedAt } = useWorkspaceSync();
    const tooltipText = lastSyncedAt ? `Sync · Last synced ${formatTime(lastSyncedAt.toISOString())}` : "Sync";

    return (
        <Tip label={isSyncing ? "Syncing…" : tooltipText} side="right">
            <button
                onClick={() => void sync()}
                disabled={isSyncing}
                aria-label="Sync workspace"
                className="btn-icon rounded-2xl text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] disabled:opacity-50 outline-none"
            >
                <RefreshCw size={18} className={isSyncing ? "sync-spin" : ""} aria-hidden="true" />
            </button>
        </Tip>
    );
}
