import {
    Search, Plus, Bell, Settings, Database, Flame, ListTree, AppWindow,
    Calendar, LayoutDashboard, Sprout, Columns3,
    LogOut, LifeBuoy, Palette, ChevronDown, Sparkles, Trash2,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";

import * as Tooltip from "../primitives/Tooltip";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as Popover from "../primitives/Popover";
import * as AlertDialog from "../primitives/AlertDialog";
import { Tip } from "./Tip";
import { useApiClient } from "../../hooks/use-api-client";
import { authClient } from "../../lib/auth-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import * as Dialog from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { BellRing } from "lucide-react";
import { hardRefreshWorkspaceCaches } from "../../lib/api/workspace-cache";

/** Nav item accent color definitions per Design Manifesto §1.9 */
const NAV_LINKS = [
    {
        to: "/",
        icon: LayoutDashboard,
        label: "Today",
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
    const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);

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

    return (
        <div
            className="flex h-dvh w-[60px] flex-col items-center gap-2 border-r border-twilight-border py-5 shrink-0"
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
                    const showDot = notificationFn && notificationFn();
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

            <Dialog.Dialog open={searchOpen} onOpenChange={setSearchOpen}>
                <Tip label="Search">
                    <Dialog.DialogTrigger asChild>
                        <button
                            aria-label="Search"
                            className="btn-icon rounded-2xl text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] outline-none"
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
                            className="btn-icon rounded-2xl text-twilight-text-muted hover:text-lantern hover:bg-lantern-dim outline-none"
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

            <Popover.Root modal={false} open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <Tip label="Notifications">
                    <Popover.Trigger asChild>
                        <button
                            aria-label="Notifications"
                            className="btn-icon rounded-2xl text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] outline-none"
                        >
                            <Bell size={18} aria-hidden="true" />
                        </button>
                    </Popover.Trigger>
                </Tip>
                <Popover.Content side="right" align="start" className="w-[19rem] p-0 overflow-hidden">
                    <div className="border-b border-twilight-border px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-twilight-text-soft">
                            Notifications
                        </p>
                        <h2 className="mt-1 font-display text-lg font-semibold text-twilight-text">
                            Recent activity
                        </h2>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-2 px-5 py-7 text-center text-twilight-text-soft">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-twilight-surface">
                            <BellRing size={20} className="text-moonlit" aria-hidden="true" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-twilight-text">
                                Nothing new yet
                            </p>
                            <p className="mt-1 text-[13px] leading-relaxed">
                                Task reminders and workspace updates will appear here without interrupting your flow.
                            </p>
                        </div>
                    </div>
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
                        className="w-[290px] p-2"
                    >
                        <div className="px-3 pb-2 pt-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-twilight-text-soft">
                                Developer Tools
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-twilight-text-muted">
                                Load a full QA workspace or wipe every user-scoped table while keeping your account.
                            </p>
                        </div>

                        <DropdownMenu.Separator className="bg-twilight-border-light" />

                        <DropdownMenu.Item
                            disabled={isLoading}
                            onSelect={(event) => {
                                if (isLoading) {
                                    event.preventDefault();
                                    return;
                                }
                                void handleSeedData();
                            }}
                            className="flex items-start gap-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        >
                            <Sparkles size={16} className="mt-0.5 text-blue-300" aria-hidden="true" />
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium text-twilight-text">Inject full test data</p>
                                <p className="text-xs leading-relaxed text-twilight-text-muted">
                                    Seeds projects, sections, tags, tasks, habits, inbox items, metrics, and archives.
                                </p>
                            </div>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item
                            disabled={isLoading}
                            variant="danger"
                            onSelect={(event) => {
                                if (isLoading) {
                                    event.preventDefault();
                                    return;
                                }
                                setWipeConfirmOpen(true);
                            }}
                            className="flex items-start gap-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                        >
                            <Trash2 size={16} className="mt-0.5" aria-hidden="true" />
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium text-red-300">Wipe test data</p>
                                <p className="text-xs leading-relaxed text-red-200/70">
                                    Deletes tasks, projects, sections, tags, habits, logs, inbox items, metrics, and AI memory.
                                </p>
                            </div>
                        </DropdownMenu.Item>
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

            {/* Profile avatar */}
            <div className="w-[40%] h-px bg-twilight-border my-1 rounded-full opacity-50" aria-hidden="true" />
            {isPending ? (
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

                        <div className="px-2 pb-2">
                            <Button variant="secondary" size="md" className="w-full" onClick={() => navigate("?settings=account")}>
                                Manage your Account
                            </Button>
                        </div>

                        <DropdownMenu.Separator className="bg-twilight-border-light" />

                        <div className="p-1">
                            <DropdownMenu.Item className="flex items-center gap-3 px-3 py-2.5 text-[15px] rounded-lg hover:bg-white/5 cursor-pointer outline-none transition-colors" onSelect={() => navigate("?settings=account")}>
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
