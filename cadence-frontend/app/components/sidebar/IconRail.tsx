import {
    Search, Plus, Bell, Settings, Database, Flame, ListTree, AppWindow,
    Calendar, LayoutDashboard, RefreshCw, Columns3,
    LogOut, LifeBuoy, Palette,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";

import * as Tooltip from "../primitives/Tooltip";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Tip } from "./Tip";
import { useApiClient } from "../../hooks/use-api-client";
import { authClient } from "../../lib/auth-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import * as Dialog from "../primitives/Dialog";

/** Nav item accent color definitions per Design Manifesto §1.9 */
const NAV_LINKS = [
    {
        to: "/",
        icon: LayoutDashboard,
        label: "Planner",
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
        icon: RefreshCw,
        label: "Weekly Reset",
        activeColor: "text-lantern",
        activeBg: "bg-lantern/15 glow-lantern",
        hoverColor: "hover:text-lantern/70",
        hoverBg: "hover:bg-lantern/8 hover:glow-lantern",
        notificationFn: () => new Date().getDay() === 1, // subtle dot if Monday
    },
] as const;

/** The narrow icon rail on the left of the sidebar */
export function IconRail() {
    const location = useLocation();
    const navigate = useNavigate();
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { data: session, isPending } = authClient.useSession();

    const [isLoading, setIsLoading] = useState(false);

    // Dialog states
    const [searchOpen, setSearchOpen] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const handleSeedData = async () => {
        setIsLoading(true);
        try {
            await toast.promise(
                async () => {
                    const res = await api.api.debug.seed.$post();
                    if (!res.ok) throw new Error("Failed to seed data");
                    await queryClient.invalidateQueries();
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
                    await queryClient.invalidateQueries();
                },
                {
                    loading: "Wiping database...",
                    success: "Data wiped successfully!",
                    error: "Failed to wipe data.",
                }
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="w-[56px] flex flex-col items-center py-5 gap-2 border-r border-twilight-border shrink-0"
            role="navigation"
            aria-label="Icon navigation rail"
        >
            {/* Logo */}
            <div
                className="w-9 h-9 rounded-xl bg-lantern/15 flex items-center justify-center mb-2 glow-lantern"
                aria-label="Cadence"
            >
                <span className="text-lantern font-display font-bold text-base" aria-hidden="true">C</span>
            </div>

            <div className="w-[60%] h-px bg-twilight-border rounded-full my-1" aria-hidden="true" />

            {/* Primary nav links */}
            <nav aria-label="Primary navigation" className="flex flex-col items-center gap-1.5 w-full px-2">
                {NAV_LINKS.map(({ to, icon: Icon, label, activeColor, activeBg, hoverColor, hoverBg, notificationFn }) => {
                    const isActive = location.pathname === to;
                    const showDot = notificationFn && notificationFn();
                    return (
                        <Tip key={to} label={label} side="right">
                            <Link
                                to={to}
                                aria-label={label}
                                aria-current={isActive ? "page" : undefined}
                                className={`
                                    relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer outline-none
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

            <Dialog.Dialog open={searchOpen} onOpenChange={setSearchOpen}>
                <Tip label="Search">
                    <Dialog.DialogTrigger asChild>
                        <button
                            aria-label="Search"
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer outline-none"
                        >
                            <Search size={18} aria-hidden="true" />
                        </button>
                    </Dialog.DialogTrigger>
                </Tip>
                <Dialog.DialogContent className="sm:max-w-[500px]">
                    <Dialog.DialogHeader>
                        <Dialog.DialogTitle>Search</Dialog.DialogTitle>
                        <Dialog.DialogDescription>Universal search coming soon.</Dialog.DialogDescription>
                    </Dialog.DialogHeader>
                    <div className="py-12 flex flex-col items-center justify-center text-twilight-text-muted">
                        <Search size={32} className="mb-4 opacity-50" aria-hidden="true" />
                        <p>Search interface placeholder</p>
                    </div>
                </Dialog.DialogContent>
            </Dialog.Dialog>

            <Dialog.Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
                <Tip label="Quick add">
                    <Dialog.DialogTrigger asChild>
                        <button
                            aria-label="Quick add task"
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-twilight-text-muted hover:text-lantern hover:bg-lantern-dim transition-colors cursor-pointer outline-none"
                        >
                            <Plus size={18} aria-hidden="true" />
                        </button>
                    </Dialog.DialogTrigger>
                </Tip>
                <Dialog.DialogContent className="sm:max-w-[425px]">
                    <Dialog.DialogHeader>
                        <Dialog.DialogTitle>Quick Add</Dialog.DialogTitle>
                        <Dialog.DialogDescription>Add a new task or project quickly.</Dialog.DialogDescription>
                    </Dialog.DialogHeader>
                    <div className="py-12 flex flex-col items-center justify-center text-twilight-text-muted">
                        <Plus size={32} className="mb-4 opacity-50" aria-hidden="true" />
                        <p>Quick Add palette placeholder</p>
                    </div>
                </Dialog.DialogContent>
            </Dialog.Dialog>

            <div className="flex-1" />

            <Dialog.Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <Tip label="Notifications">
                    <Dialog.DialogTrigger asChild>
                        <button
                            aria-label="Notifications"
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer outline-none"
                        >
                            <Bell size={18} aria-hidden="true" />
                        </button>
                    </Dialog.DialogTrigger>
                </Tip>
                <Dialog.DialogContent className="sm:max-w-[425px]">
                    <Dialog.DialogHeader>
                        <Dialog.DialogTitle>Notifications</Dialog.DialogTitle>
                        <Dialog.DialogDescription>Recent activity and alerts.</Dialog.DialogDescription>
                    </Dialog.DialogHeader>
                    <div className="py-12 flex flex-col items-center justify-center text-twilight-text-muted">
                        <Bell size={32} className="mb-4 opacity-50" aria-hidden="true" />
                        <p>No new notifications</p>
                    </div>
                </Dialog.DialogContent>
            </Dialog.Dialog>

            <Dialog.Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <Tip label="Settings">
                    <Dialog.DialogTrigger asChild>
                        <button
                            aria-label="Settings"
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer outline-none"
                        >
                            <Settings size={18} aria-hidden="true" />
                        </button>
                    </Dialog.DialogTrigger>
                </Tip>
                <Dialog.DialogContent className="sm:max-w-[85vw] h-[85vh] flex flex-col">
                    <Dialog.DialogHeader className="shrink-0 mb-6">
                        <Dialog.DialogTitle className="text-2xl">Settings</Dialog.DialogTitle>
                        <Dialog.DialogDescription>
                            Manage your account, application preferences, and view system status.
                        </Dialog.DialogDescription>
                    </Dialog.DialogHeader>
                    <div className="flex-1 min-h-0 flex border border-twilight-border-light rounded-3xl bg-twilight-deep overflow-hidden relative shadow-inner">
                        {/* Soft atmospheric gradient */}
                        <div className="absolute inset-0 bg-gradient-to-br from-twilight-surface/30 to-transparent pointer-events-none" />

                        <div className="w-64 border-r border-twilight-border p-4 bg-twilight-surface/20 backdrop-blur-sm z-10">
                            <div className="space-y-1">
                                <button className="w-full text-left px-4 py-2.5 rounded-xl bg-twilight-text/5 text-twilight-text relative overflow-hidden group border border-twilight-border-light text-sm font-medium flex items-center gap-2">
                                    <div className="absolute inset-0 bg-gradient-to-r from-lantern/10 to-transparent opacity-100" />
                                    <AppWindow size={16} aria-hidden="true" className="relative z-10 text-lantern" />
                                    <span className="relative z-10">General</span>
                                </button>
                                <button className="w-full text-left px-4 py-2.5 rounded-xl text-twilight-text-muted hover:text-twilight-text hover:bg-twilight-text/5 transition-colors border border-transparent text-sm font-medium flex items-center gap-2">
                                    <ListTree size={16} aria-hidden="true" />
                                    Integrations
                                </button>
                                <button className="w-full text-left px-4 py-2.5 rounded-xl text-twilight-text-muted hover:text-twilight-text hover:bg-twilight-text/5 transition-colors border border-transparent text-sm font-medium flex items-center gap-2">
                                    <Palette size={16} aria-hidden="true" />
                                    Appearance
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 p-10 flex flex-col items-center justify-center text-twilight-text-muted z-10 relative">
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
                                <Settings size={400} />
                            </div>
                            <div className="relative z-10 flex flex-col items-center justify-center">
                                <div className="w-16 h-16 rounded-2xl bg-twilight-surface ring-1 ring-twilight-border flex items-center justify-center mb-6 shadow-2xl">
                                    <Settings size={28} className="text-lantern" aria-hidden="true" />
                                </div>
                                <h3 className="text-xl font-medium text-twilight-text mb-3 tracking-tight">Settings Overview</h3>
                                <p className="text-[15px] max-w-sm text-center leading-relaxed text-twilight-text-soft">
                                    Configure global application preferences here. Detailed settings will be added in future updates.
                                </p>
                            </div>
                        </div>
                    </div>
                </Dialog.DialogContent>
            </Dialog.Dialog>

            {/* Developer Tools */}
            <div className="w-[40%] h-px bg-twilight-border my-1 rounded-full opacity-50" aria-hidden="true" />

            <Tip label={isLoading ? "Loading..." : "Inject Test Data"}>
                <button
                    onClick={handleSeedData}
                    disabled={isLoading}
                    aria-label="Inject test data"
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors cursor-pointer disabled:opacity-50 outline-none"
                >
                    <Database size={18} aria-hidden="true" />
                </button>
            </Tip>

            <Tip label={isLoading ? "Loading..." : "Wipe Test Data"}>
                <button
                    onClick={handleClearData}
                    disabled={isLoading}
                    aria-label="Wipe test data"
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 outline-none"
                >
                    <Flame size={18} aria-hidden="true" />
                </button>
            </Tip>

            {/* Profile avatar */}
            <div className="w-[40%] h-px bg-twilight-border my-1 rounded-full opacity-50" aria-hidden="true" />
            {isPending ? (
                <div className="w-8 h-8 rounded-full border-2 border-lantern border-t-transparent animate-spin opacity-50" />
            ) : session ? (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            aria-label="Profile menu"
                            className="w-9 h-9 rounded-full bg-lantern/10 ring-1 ring-twilight-border overflow-hidden cursor-pointer hover:ring-lantern/30 transition-colors flex items-center justify-center"
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

                        <div className="px-2 pb-2">
                            <button className="w-full px-3 py-2 rounded-lg border border-twilight-border-light text-sm text-twilight-text hover:bg-twilight-border transition-colors">
                                Manage your Account
                            </button>
                        </div>

                        <DropdownMenu.Separator className="bg-twilight-border-light" />

                        <div className="p-1">
                            <DropdownMenu.Item className="flex items-center gap-3 px-3 py-2.5 text-[15px] rounded-lg hover:bg-white/5 cursor-pointer outline-none transition-colors">
                                <Settings size={16} className="text-twilight-text-muted" aria-hidden="true" />
                                <span>Preferences</span>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item className="flex items-center gap-3 px-3 py-2.5 text-[15px] rounded-lg hover:bg-white/5 cursor-pointer outline-none transition-colors">
                                <LifeBuoy size={16} className="text-twilight-text-muted" aria-hidden="true" />
                                <span>Help & Feedback</span>
                            </DropdownMenu.Item>
                        </div>

                        <DropdownMenu.Separator className="bg-twilight-border-light" />

                        <div className="p-1">
                            <DropdownMenu.Item
                                onSelect={async () => {
                                    await authClient.signOut();
                                    navigate("/auth/sign-in");
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