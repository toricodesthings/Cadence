import {
    Search, Plus, Bell, Settings, Database, Flame,
    Calendar, LayoutDashboard, Sprout,
    LogOut, LifeBuoy, ChevronDown, Sparkles, Trash2, RefreshCw,
    BellRing, CheckCircle2, Info, TriangleAlert, CircleAlert, LoaderCircle,
    ShieldCheck, FileText, History,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";

import * as Tooltip from "../primitives/Tooltip";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as Popover from "../primitives/Popover";
import * as AlertDialog from "../primitives/AlertDialog";
import { Tip } from "./Tip";
import { useApiClient } from "../../hooks/auth/use-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "../primitives/Button";
import { hardRefreshWorkspaceCaches } from "../../lib/api/workspace-cache";
import { useWorkspaceSync } from "../../hooks/core/use-workspace-sync";
import { useNotificationCenter } from "../../hooks/notifications/use-notification-center";
import { useHabitUnresolvedSummary } from "../../hooks/habits/use-habit-unresolved";
import { useSettings } from "../../hooks/core/use-settings";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { getDateFormatConfig } from "../../lib/utils/date-format";
import { useAdminCapabilities } from "../../hooks/auth/use-admin-capabilities";
import { useAuthState } from "../../hooks/auth/use-auth-state";

/** Nav item accent color definitions per Design Manifesto §1.9 */
const NAV_LINKS = [
    {
        to: "/",
        icon: LayoutDashboard,
        label: "Capture",
        activeColor: "text-[var(--color-nav-planner)]",
        activeBg: "bg-[var(--color-nav-planner)]/15 glow-lantern",
        hoverColor: "hover:text-[var(--color-nav-planner)]/70",
        hoverBg: "hover:bg-[var(--color-nav-planner)]/8 hover:glow-lantern",
        notificationFn: undefined,
    },
    {
        to: "/schedule",
        icon: Calendar,
        label: "Schedule",
        activeColor: "text-[var(--color-nav-schedule)]",
        activeBg: "bg-[var(--color-nav-schedule)]/15 glow-moonlit",
        hoverColor: "hover:text-[var(--color-nav-schedule)]/70",
        hoverBg: "hover:bg-[var(--color-nav-schedule)]/8 hover:glow-moonlit",
        notificationFn: undefined,
    },
    {
        to: "/habits",
        icon: Flame,
        label: "Habits",
        activeColor: "text-lantern",
        activeBg: "bg-lantern/15 glow-lantern",
        hoverColor: "hover:text-lantern/70",
        hoverBg: "hover:bg-lantern/8 hover:glow-lantern",
        notificationFn: undefined,
    },
    {
        to: "/weekly-review",
        icon: Sprout,
        label: "Weekly Reset",
        activeColor: "text-[var(--color-nav-planner)]",
        activeBg: "bg-[var(--color-nav-planner)]/15 glow-lantern",
        hoverColor: "hover:text-[var(--color-nav-planner)]/70",
        hoverBg: "hover:bg-[var(--color-nav-planner)]/8 hover:glow-lantern",
        notificationFn: () => new Date().getDay() === 1, // subtle dot if Monday
    },
] as const;

const PROFILE_SUPPORT_LINKS: Array<{
    label: string;
    icon: typeof Info;
    to?: string;
    settingsTab?: "about";
}> = [
    { settingsTab: "about", icon: Info, label: "About" },
    { to: "/changelog", icon: History, label: "Changelog" },
    { to: "/privacy-policy", icon: ShieldCheck, label: "Privacy & Policy" },
    { to: "/terms", icon: FileText, label: "Terms & Conditions" },
    { to: "/help-feedback", icon: LifeBuoy, label: "Help & Feedback" },
];

/** The narrow icon rail on the left of the sidebar */
export function IconRail({
    onSearchOpen,
    onQuickAddOpen,
}: {
    onSearchOpen?: () => void;
    onQuickAddOpen?: () => void;
}) {
    const location = useLocation();
    const navigate = useNavigate();
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { session, authReady, completeSignOut } = useAuthState();
    const { data: adminCapabilities } = useAdminCapabilities();
    const canUseDeveloperTools = adminCapabilities?.canUseDeveloperTools ?? false;

    const [isLoading, setIsLoading] = useState(false);

    // Dialog states
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);

    // Notification center
    const { grouped, hasUnread, markRead, markAllRead, dismiss } = useNotificationCenter();

    // Habit due indicator
    const { data: unresolvedHabits } = useHabitUnresolvedSummary();
    const { data: railSettings } = useSettings();
    const showHabitDot = railSettings?.notifications?.showHabitNavDueCount !== false;
    const hasHabitsDue = showHabitDot && (unresolvedHabits?.length ?? 0) > 0;

    const handleSeedData = async () => {
        setIsLoading(true);
        try {
            await toast.promise(
                async () => {
                    const res = await api.api.debug.seed.$post();
                    if (!res.ok) throw new Error("Failed to seed data");
                    await hardRefreshWorkspaceCaches(queryClient);
                },
                {
                    loading: "Injecting test data...",
                    success: "Test data injected successfully!",
                    error: "Failed to inject data.",
                }
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearData = async () => {
        setIsLoading(true);
        try {
            await toast.promise(
                async () => {
                    const res = await api.api.debug.clear.$post();
                    if (!res.ok) throw new Error("Failed to clear data");
                    await hardRefreshWorkspaceCaches(queryClient);
                },
                {
                    loading: "Wiping database...",
                    success: "Workspace wiped. Account kept intact.",
                    error: "Failed to wipe data.",
                }
            );
        } finally {
            setWipeConfirmOpen(false);
            setIsLoading(false);
        }
    };

    const handlePreviewToast = (kind: "default" | "success" | "info" | "warning" | "error" | "loading") => {
        toast.dismiss();

        switch (kind) {
            case "default":
                toast.message("Default toast", {
                    description: "Neutral Cadence surface with the animated progress border.",
                });
                return;
            case "success":
                toast.success("Success toast", {
                    description: "Use this for saved changes, completed actions, and confirmations.",
                });
                return;
            case "info":
                toast.info("Info toast", {
                    description: "Good for ambient updates that do not need immediate action.",
                });
                return;
            case "warning":
                toast.warning("Warning toast", {
                    description: "Previewing action and cancel pills on the warning variant.",
                    action: {
                        label: "Review",
                        onClick: () => undefined,
                    },
                    cancel: {
                        label: "Later",
                        onClick: () => undefined,
                    },
                    duration: 6500,
                });
                return;
            case "error":
                toast.error("Error toast", {
                    description: "Use for failed mutations, sync issues, and blocked flows.",
                });
                return;
            case "loading":
                toast.loading("Loading toast", {
                    description: "Loading toasts keep the progress border hidden while work is in flight.",
                });
        }
    };

    const devToolTiles = [
        {
            key: "seed",
            label: "Seed",
            meta: "Data",
            icon: Sparkles,
            iconClassName: "text-lantern",
            surfaceClassName: "border-lantern/18 bg-lantern/[0.08] shadow-[0_0_24px_rgba(232,164,74,0.08)]",
            action: () => {
                void handleSeedData();
            },
        },
        {
            key: "default",
            label: "Default",
            meta: "Toast",
            icon: BellRing,
            iconClassName: "text-twilight-text-soft",
            surfaceClassName: "border-white/10 bg-white/[0.035]",
            action: () => handlePreviewToast("default"),
        },
        {
            key: "loading_screen",
            label: "Loading",
            meta: "Screen",
            icon: Sparkles,
            iconClassName: "text-blue-400",
            surfaceClassName: "border-blue-500/20 bg-blue-500/10",
            action: () => {
                window.dispatchEvent(new CustomEvent("debug:loading", { detail: { duration: 10000 } }));
            },
        },
        {
            key: "success",
            label: "Success",
            meta: "Toast",
            icon: CheckCircle2,
            iconClassName: "text-feedback-success",
            surfaceClassName: "border-feedback-success/18 bg-feedback-success/[0.08]",
            action: () => handlePreviewToast("success"),
        },
        {
            key: "info",
            label: "Info",
            meta: "Toast",
            icon: Info,
            iconClassName: "text-moonlit",
            surfaceClassName: "border-moonlit/18 bg-moonlit/[0.08]",
            action: () => handlePreviewToast("info"),
        },
        {
            key: "warning",
            label: "Warning",
            meta: "Toast",
            icon: TriangleAlert,
            iconClassName: "text-lantern",
            surfaceClassName: "border-lantern/18 bg-lantern/[0.08]",
            action: () => handlePreviewToast("warning"),
        },
        {
            key: "error",
            label: "Error",
            meta: "Toast",
            icon: CircleAlert,
            iconClassName: "text-feedback-error",
            surfaceClassName: "border-feedback-error/18 bg-feedback-error/[0.08]",
            action: () => handlePreviewToast("error"),
        },
        {
            key: "loading",
            label: "Loading",
            meta: "Toast",
            icon: LoaderCircle,
            iconClassName: "text-moonlit",
            surfaceClassName: "border-moonlit/18 bg-moonlit/[0.08]",
            action: () => handlePreviewToast("loading"),
        },
        {
            key: "wipe",
            label: "Wipe",
            meta: "Workspace",
            icon: Trash2,
            iconClassName: "text-feedback-error",
            surfaceClassName: "border-feedback-error/18 bg-feedback-error/[0.08] shadow-[0_0_24px_rgba(217,119,86,0.08)]",
            action: () => setWipeConfirmOpen(true),
        },
    ] as const;

    return (
        <div
            className="flex h-full w-[60px] flex-col items-center gap-2 border-r border-twilight-border py-5 shrink-0"
            role="navigation"
            aria-label="Icon navigation rail"
        >
            {/* Logo */}
            <div
                className="size-11 flex items-center justify-center mb-2 mt-0"
                aria-label="Cadence"
            >
                <img src="/logo.png" alt="Cadence" className="size-full object-cover" />
            </div>

            <div className="w-[60%] h-px bg-twilight-border rounded-full my-1" aria-hidden="true" />

            {/* Primary nav links */}
            <nav aria-label="Primary navigation" className="flex flex-col items-center gap-1.5 w-full px-2">
                {NAV_LINKS.map(({ to, icon: Icon, label, activeColor, activeBg, hoverColor, hoverBg, notificationFn }) => {
                    const isActive = location.pathname === to;
                    const showDot = to === "/habits" ? hasHabitsDue : notificationFn && notificationFn();
                    return (
                        <Tip key={to} label={label} side="right">
                            <Link
                                to={to}
                                aria-label={label}
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
                                {showDot && !isActive && (
                                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-lantern border-2 border-twilight" />
                                )}
                            </Link>
                        </Tip>
                    );
                })}
            </nav>

            <div className="w-[60%] h-px bg-twilight-border rounded-full my-1" aria-hidden="true" />

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
                    className="btn-icon rounded-2xl text-twilight-text-muted hover:text-lantern hover:bg-lantern-dim outline-none"
                >
                    <Plus size={18} aria-hidden="true" />
                </button>
            </Tip>

            {!IS_DESKTOP_RUNTIME && <SyncButton />}

            <div className="flex-1" />

            <Popover.Root modal={false} open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <Tip label="Notifications">
                    <Popover.Trigger asChild>
                        <button
                            aria-label="Notifications"
                            className="btn-icon relative rounded-2xl text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] outline-none"
                        >
                            <Bell size={18} aria-hidden="true" />
                            {hasUnread && (
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-lantern" />
                            )}
                        </button>
                    </Popover.Trigger>
                </Tip>
                <Popover.Content side="right" align="start" className="w-[20rem] p-0 overflow-hidden">
                    <NotificationCenter
                        grouped={grouped}
                        hasUnread={hasUnread}
                        markRead={markRead}
                        markAllRead={markAllRead}
                        dismiss={dismiss}
                        onClose={() => setNotificationsOpen(false)}
                    />
                    <Popover.Arrow className="fill-twilight-surface" />
                </Popover.Content>
            </Popover.Root>

            <Tip label="Settings" side="right">
                <button
                    onClick={() => navigate("?settings=account")}
                    aria-label="Settings"
                    className="btn-icon rounded-2xl text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] outline-none"
                >
                    <Settings size={18} aria-hidden="true" />
                </button>
            </Tip>

            {canUseDeveloperTools ? (
                <>
                    {/* Developer Tools */}
                    <div className="w-[40%] h-px bg-twilight-border my-1 rounded-full opacity-50" aria-hidden="true" />

                    <AlertDialog.Root open={wipeConfirmOpen} onOpenChange={setWipeConfirmOpen}>
                        <DropdownMenu.Root>
                            <Tip label={isLoading ? "Working..." : "Developer tools"}>
                                <DropdownMenu.Trigger asChild>
                                    <button
                                        disabled={isLoading}
                                        aria-label="Developer tools"
                                        className="btn-icon relative rounded-2xl text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 disabled:opacity-50 outline-none"
                                    >
                                        <Database size={18} aria-hidden="true" />
                                        <ChevronDown
                                            size={11}
                                            aria-hidden="true"
                                            className="absolute bottom-1.5 right-1.5 text-current/70"
                                        />
                                    </button>
                                </DropdownMenu.Trigger>
                            </Tip>

                            <DropdownMenu.Content
                                side="right"
                                align="center"
                                sideOffset={14}
                                className="w-[340px] p-2.5"
                            >
                                <div className="px-1.5 pb-3 pt-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-twilight-text-soft">
                                        Developer Tools
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-twilight-text-muted">
                                        Workspace utilities and toast previews, arranged like a compact launchpad.
                                    </p>
                                </div>

                                <div className="grid grid-cols-4 gap-2">
                                    {devToolTiles.map(({ key, label, meta, icon: Icon, iconClassName, surfaceClassName, action }) => (
                                        <DropdownMenu.Item
                                            key={key}
                                            disabled={isLoading}
                                            onSelect={(event) => {
                                                if (isLoading) {
                                                    event.preventDefault();
                                                    return;
                                                }
                                                action();
                                            }}
                                            className={`
                                                group relative min-h-[88px] rounded-[1.35rem] border p-0 text-left
                                                backdrop-blur-xl transition-[transform,border-color,background-color,box-shadow]
                                                data-[disabled]:pointer-events-none data-[disabled]:opacity-50
                                                data-[highlighted]:-translate-y-0.5 data-[highlighted]:border-white/16
                                                data-[highlighted]:bg-white/[0.05]
                                                ${surfaceClassName}
                                            `}
                                        >
                                            <div className="flex h-full flex-col items-center justify-center gap-2.5 px-2 py-3 text-center">
                                                <div
                                                    className={`
                                                        flex size-10 items-center justify-center rounded-[1rem] border border-white/8
                                                        bg-twilight-void/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]
                                                        ${iconClassName}
                                                    `}
                                                >
                                                    <Icon
                                                        size={16}
                                                        aria-hidden="true"
                                                        className={key === "loading" ? "animate-spin" : undefined}
                                                    />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <p className="text-[11px] font-medium leading-none text-twilight-text">
                                                        {label}
                                                    </p>
                                                    <p className="text-[9px] uppercase tracking-[0.18em] text-twilight-text-muted">
                                                        {meta}
                                                    </p>
                                                </div>
                                            </div>
                                        </DropdownMenu.Item>
                                    ))}
                                </div>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>

                        <AlertDialog.Content>
                            <AlertDialog.Header>
                                <AlertDialog.Title>Wipe all test workspace data?</AlertDialog.Title>
                                <AlertDialog.Description>
                                    This deletes every user-scoped record except the `users` table entry and its saved settings.
                                    Projects, tasks, habits, inbox items, sections, tags, metrics, and AI memory will all be removed.
                                </AlertDialog.Description>
                            </AlertDialog.Header>
                            <AlertDialog.Footer>
                                <AlertDialog.Cancel asChild>
                                    <Button variant="secondary" size="md">
                                        Cancel
                                    </Button>
                                </AlertDialog.Cancel>
                                <AlertDialog.Action asChild>
                                    <Button
                                        variant="danger"
                                        size="md"
                                        onClick={() => {
                                            void handleClearData();
                                        }}
                                    >
                                        Wipe workspace
                                    </Button>
                                </AlertDialog.Action>
                            </AlertDialog.Footer>
                        </AlertDialog.Content>
                    </AlertDialog.Root>
                </>
            ) : null}

            {/* Profile avatar */}
            <div className="w-[40%] h-px bg-twilight-border my-1 rounded-full opacity-50" aria-hidden="true" />
            {!authReady ? (
                <div className="w-8 h-8 rounded-full border-2 border-lantern border-t-transparent animate-spin opacity-50" />
            ) : session ? (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            aria-label="Profile menu"
                            className="touch-target w-11 h-11 rounded-full bg-lantern/10 ring-1 ring-twilight-border overflow-hidden cursor-pointer hover:ring-lantern/30 transition-colors flex items-center justify-center"
                        >
                            {session.user.image ? (
                                <img src={session.user.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-lantern text-xs font-semibold font-display">
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
                            <div className="w-20 h-20 rounded-full bg-lantern/10 ring-1 ring-twilight-border mb-3 overflow-hidden flex items-center justify-center">
                                {session.user.image ? (
                                    <img src={session.user.image} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-lantern text-3xl font-semibold font-display">
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
                            {PROFILE_SUPPORT_LINKS.map(({ to, settingsTab, icon: Icon, label }) => (
                                <DropdownMenu.Item
                                    key={to ?? settingsTab}
                                    className="flex items-center gap-3 px-3 py-2.5 text-[15px] rounded-lg hover:bg-white/5 cursor-pointer outline-none transition-colors"
                                    onSelect={() => navigate(settingsTab ? `?settings=${settingsTab}` : to!)}
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
                                    void completeSignOut().catch((error) => {
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
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-twilight-text-muted hover:text-lantern hover:bg-lantern-dim transition-colors cursor-pointer outline-none"
                    >
                        <LogOut size={18} aria-hidden="true" />
                    </Link>
                </Tip>
            )}
        </div>
    );
}

/** Sync button with rotating icon while syncing */
function SyncButton() {
    const { sync, isSyncing, lastSyncedAt } = useWorkspaceSync();
    const is24h = getDateFormatConfig().timeDisplay === "24h";
    const tooltipText = lastSyncedAt
        ? `Sync · Last synced ${lastSyncedAt.toLocaleTimeString(is24h ? "en-GB" : [], { hour: "numeric", minute: "2-digit", hour12: !is24h })}`
        : "Sync";

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
