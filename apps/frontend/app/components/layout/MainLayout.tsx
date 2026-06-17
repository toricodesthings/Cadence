import { Sidebar } from "../sidebar/Sidebar";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router";
import * as Tooltip from "../primitives/Tooltip";
import { Download, Minus, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, WifiOff } from "lucide-react";
import { useSidebarStore } from "../../stores/sidebar-store";
import { useAssistantStore } from "../../stores/assistant-store";
import { useRightPanelStore, type RailView } from "../../stores/right-panel-store";
import { AssistantSidePanel } from "../assistant/AssistantSidePanel";
import { AssistantLauncher } from "../assistant/AssistantLauncher";
import { ResponsiveOverlayPanel } from "../shared/ResponsiveOverlayPanel";
import { RailViewToggle } from "./RailViewToggle";
import { useKeyboardShortcuts } from "../../hooks/core/use-keyboard-shortcuts";
import { Loading } from "../shared/Loading";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useDocumentMeta } from "../../hooks/core/use-document-meta";
import { useFocusViews } from "../../hooks/core/use-focus-views";
import { useSettings } from "../../hooks/core/use-settings";
import { useNotificationCenter } from "../../hooks/notifications/use-notification-center";
import { useBrowserNotifications } from "../../hooks/notifications/use-browser-notifications";
import { useThemeSync } from "../../hooks/ui/use-theme-sync";
import { useViewMode } from "../../hooks/ui/use-view-mode";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { useTaskSelectionStore } from "../../stores/task-selection-store";
import { useBatchStateTransition } from "../../hooks/tasks/use-batch-state";
import { toast } from "sonner";
import type { PageWidth } from "./PageLayout";
import { CompactPageControls } from "../shared/CompactPageControls";
import { ContextualAddOrb } from "../shared/ContextualAddOrb";
import type { QuickAddTab } from "../quick-add/QuickAddSurface";
import { useMutationOutbox } from "../../lib/api/mutation-outbox";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { useAvailableDesktopUpdate } from "../../platform/desktop-update-state";
import { useDesktopLayoutScale } from "../../hooks/ui/use-desktop-layout-scale";
import { SyncInspectorDialog } from "../desktop/SyncInspectorDialog";
import { BackgroundLayer } from "../settings/appearance/BackgroundLayer";
import { useWorkspaceSync } from "../../hooks/core/use-workspace-sync";
import { setDiagnosticsEnabled } from "../../lib/api/track-event";
import {
    configureGlobalQuickCaptureShortcut,
    listenForDesktopCommands,
    listenForQuickCaptureCompletions,
    openQuickCaptureWindow,
    readRememberedDesktopWorkspaceRoute,
    rememberDesktopWorkspaceRoute,
} from "../../platform/desktop-shell";
import { useDesktopCommandPreferences } from "../../hooks/ui/use-desktop-command-preferences";

const CommandPalette = lazy(() => import("../command-palette/CommandPalette").then((m) => ({ default: m.CommandPalette })));
const MobileSearchSheet = lazy(() => import("../command-palette/MobileSearchSheet").then((m) => ({ default: m.MobileSearchSheet })));
const ShortcutReference = lazy(() => import("../shared/ShortcutReference").then((m) => ({ default: m.ShortcutReference })));
const SettingsDialog = lazy(() => import("../settings/SettingsDialog").then((m) => ({ default: m.SettingsDialog })));
const QuickAddSurface = lazy(() => import("../quick-add/QuickAddSurface").then((m) => ({ default: m.QuickAddSurface })));
const FloatingActionBar = lazy(() => import("../tasks/FloatingActionBar").then((m) => ({ default: m.FloatingActionBar })));
const TaskNoteRoom = lazy(() => import("../tasks/TaskNoteRoom").then((m) => ({ default: m.TaskNoteRoom })));

/** Matches the contextual side panel's slide envelope (home.tsx) so the
 * assistant opens/closes at the same calibre. */
const ASSISTANT_PANEL_MOTION = { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const };

/** Crossfade calibre for flipping the rail between the contextual panel and
 * Cadence (both stay mounted; the active pane drives the rail width while the
 * outgoing pane fades + drifts out beneath it). Slightly longer + softer than
 * the open/close so the swap reads as a glide rather than a cut. */
const RAIL_SWITCH_MOTION = { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const };

const PAGE_META: Record<string, { title: string; description: string }> = {
    "/": {
        title: "Capture",
        description: "Capture anything, clarify later, and place when ready.",
    },
    "/today": {
        title: "Today",
        description: "Review overdue work and today's commitments in one calm, focused viewer.",
    },
    "/schedule": {
        title: "Schedule",
        description: "View your week, day, month, and year with a calmer scheduling workspace built for focus.",
    },
    "/events": {
        title: "Events",
        description: "Manage yearly recurring milestones in one calm library while keeping Schedule as the date context layer.",
    },
    "/upcoming": {
        title: "Upcoming",
        description: "Review the horizon of upcoming tasks and prepare what needs attention next.",
    },
    "/completed": {
        title: "Completed",
        description: "Review what has been finished and cleared from the active workspace.",
    },
    "/trash": {
        title: "Trash",
        description: "Inspect archived and discarded tasks without cluttering the main planning flow.",
    },
    "/habits": {
        title: "Habits",
        description: "Track weekly habits in a spacious rhythm that keeps each day readable.",
    },
    "/weekly-review": {
        title: "Weekly Reset",
        description: "Process inbox items, unscheduled work, waiting tasks, and habit progress in one weekly ritual.",
    },
};

interface ShellHeaderConfig {
    title?: React.ReactNode;
    eyebrow?: React.ReactNode;
    icon?: React.ReactNode;
    accentColor?: string;
}

function subscribeToNetworkState(listener: () => void) {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);

    return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
    };
}

function getNetworkSnapshot() {
    return navigator.onLine;
}

function getServerNetworkSnapshot() {
    return true;
}

function DesktopHeaderStatus({
    onOpenPrivacySettings,
    onOpenSyncInspector,
}: {
    onOpenPrivacySettings: () => void;
    onOpenSyncInspector: () => void;
}) {
    const isOnline = useSyncExternalStore(subscribeToNetworkState, getNetworkSnapshot, getServerNetworkSnapshot);
    const outbox = useMutationOutbox();
    const update = useAvailableDesktopUpdate();
    const { layoutScale, setLayoutScale, stepLayoutScale } = useDesktopLayoutScale();

    const syncLabel = !isOnline
        ? outbox.pending > 0
            ? `${outbox.pending} queued`
            : "Offline"
        : outbox.replaying > 0
            ? `Syncing ${outbox.replaying}`
            : outbox.failed.length > 0
                ? `${outbox.failed.length} failed`
                : outbox.pending > 0
                    ? `${outbox.pending} pending`
                    : "Up to date";

    return (
        <div className="flex items-center gap-1.5">
            <button
                type="button"
                onClick={onOpenSyncInspector}
                className="hidden h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] font-medium tracking-[0.12em] text-twilight-text-soft transition-colors hover:bg-white/[0.06] lg:flex"
            >
                {!isOnline ? <WifiOff size={12} aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" className={outbox.replaying > 0 ? "sync-spin" : ""} />}
                <span className="uppercase">{syncLabel}</span>
            </button>

            {update ? (
                <button
                    type="button"
                    onClick={onOpenPrivacySettings}
                    className="hidden h-7 items-center gap-1.5 rounded-full border border-accent-primary/30 bg-accent-primary/10 px-2.5 text-[11px] font-medium tracking-[0.12em] text-accent-primary transition-colors hover:bg-accent-primary/16 lg:flex"
                >
                    <Download size={12} aria-hidden="true" />
                    <span className="uppercase">Update {update.version}</span>
                </button>
            ) : null}

            <div className="hidden h-7 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-0.5 lg:flex">
                <button
                    type="button"
                    onClick={() => void stepLayoutScale(-1)}
                    aria-label="Decrease layout scale"
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text"
                >
                    <Minus size={12} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={() => void setLayoutScale("default")}
                    className="h-[22px] rounded-full px-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text"
                >
                    {layoutScale}
                </button>
                <button
                    type="button"
                    onClick={() => void stepLayoutScale(1)}
                    aria-label="Increase layout scale"
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text"
                >
                    <Plus size={12} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

export function MainLayout({
    children,
    requireAuth = false,
    sidePanel,
    sidePanelActive,
    sidePanelLabel = "Panel",
    headerCenter,
    headerRight,
    phoneHeaderRightInline = false,
    customSidebar,
    hideHeader = false,
    hideContextualOrb = false,
    contentWidth = "default",
    pageTitle,
    pageDescription,
    shellHeader,
}: {
    children: React.ReactNode,
    requireAuth?: boolean,
    sidePanel?: React.ReactNode,
    /** Whether the contextual panel currently has something to show. When false,
     * the rail's "Context" tab is suppressed and the assistant gets the rail
     * outright. Defaults to `Boolean(sidePanel)`. */
    sidePanelActive?: boolean,
    /** Label for the contextual tab in the rail toggle (e.g. "Calendar", "Review"). */
    sidePanelLabel?: string,
    headerCenter?: React.ReactNode,
    headerRight?: React.ReactNode,
    phoneHeaderRightInline?: boolean,
    customSidebar?: React.ReactNode,
    hideHeader?: boolean,
    hideContextualOrb?: boolean,
    contentWidth?: PageWidth,
    pageTitle?: string,
    pageDescription?: string,
    shellHeader?: ShellHeaderConfig,
}) {
    const navigate = useNavigate();
    const location = useLocation();
    const { isCollapsed, toggleCollapse, mobileNavOpen: navOpen, setMobileNavOpen: setNavOpen } = useSidebarStore();
    const [commandOpen, setCommandOpen] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [shortcutsRefOpen, setShortcutsRefOpen] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddInitialTab, setQuickAddInitialTab] = useState<QuickAddTab>("task");
    const [syncInspectorOpen, setSyncInspectorOpen] = useState(false);
    const [forceLoading, setForceLoading] = useState(false);
    const { status, isAuthenticated, beginAuthRecovery } = useAuthState();
    const shell = useShellMode();
    const { assistantPanelOpen, assistantPanelWidth, setAssistantPanelWidth, toggleAssistantPanel } = useAssistantStore();
    const { railView, setRailView } = useRightPanelStore();

    // The rail is mutually exclusive. Opening the assistant claims the rail
    // (Cadence tab); closing it hands the rail back to the contextual panel.
    // Manual tab switches (via the segmented toggle) aren't disturbed because
    // this only fires when the assistant's open state actually changes.
    useEffect(() => {
        setRailView(assistantPanelOpen ? "assistant" : "context");
    }, [assistantPanelOpen, setRailView]);
    useFocusViews();
    const { data: settings } = useSettings();
    const { view, setView } = useViewMode();
    const clearActiveFocusView = useFocusViewStore((state) => state.clearActiveDefinition);
    const { selectedTaskIds, clearSelection } = useTaskSelectionStore();
    const batchState = useBatchStateTransition();
    const { stepLayoutScale, setLayoutScale } = useDesktopLayoutScale();
    const { sync } = useWorkspaceSync();
    const { preferences } = useDesktopCommandPreferences();

    useEffect(() => {
        const handleDebugLoading = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setForceLoading(true);
            setTimeout(() => setForceLoading(false), detail?.duration || 10000);
        };
        window.addEventListener("debug:loading", handleDebugLoading);
        return () => window.removeEventListener("debug:loading", handleDebugLoading);
    }, []);

    // Global assistant shortcut (⌘/Ctrl + I) — invokable from anywhere except the
    // Weekly Reset ritual, where the focused step flow owns the keyboard.
    useEffect(() => {
        const handleAssistantHotkey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "i") {
                if (location.pathname === "/weekly-review") return;
                e.preventDefault();
                toggleAssistantPanel();
            }
        };
        window.addEventListener("keydown", handleAssistantHotkey);
        return () => window.removeEventListener("keydown", handleAssistantHotkey);
    }, [location.pathname, toggleAssistantPanel]);

    // Search resolves by shell mode (§4.5). The dense, keyboard-first command
    // palette is reserved for the full `wide` workspace; every narrower shell
    // (laptop, tablet, phone) gets the dedicated MobileSearchSheet so a
    // less-wide screen never lands on the desktop dialog. Every entry point —
    // sidebar tap, ⌘K, and the focus-search shortcut — routes through here.
    const openSearch = useCallback(() => {
        if (shell.isWide) {
            setCommandOpen(true);
        } else {
            setMobileSearchOpen(true);
        }
    }, [shell.isWide]);

    useKeyboardShortcuts({
        onCommandPalette: () => {
            if (shell.isWide) {
                setCommandOpen((open) => !open);
            } else {
                setMobileSearchOpen((open) => !open);
            }
        },
        onQuickAdd: () => {
            setQuickAddInitialTab("task");
            setQuickAddOpen(true);
        },
        onFocusSearch: () => openSearch(),
        onToggleView: () => setView(view === "list" ? "kanban" : "list"),
        onCompleteTask: () => {
            const ids = Array.from(selectedTaskIds);
            if (ids.length === 0) return;
            batchState.mutate(
                { taskIds: ids, state: "COMPLETE" },
                { onSuccess: () => { toast.success(`Completed ${ids.length} task${ids.length > 1 ? "s" : ""}`); clearSelection(); } },
            );
        },
        onArchiveTask: () => {
            const ids = Array.from(selectedTaskIds);
            if (ids.length === 0) return;
            batchState.mutate(
                { taskIds: ids, state: "ARCHIVED" },
                { onSuccess: () => { toast.success(`Archived ${ids.length} task${ids.length > 1 ? "s" : ""}`); clearSelection(); } },
            );
        },
        onLayoutScaleIncrease: () => {
            if (IS_DESKTOP_RUNTIME) {
                void stepLayoutScale(1);
            }
        },
        onLayoutScaleDecrease: () => {
            if (IS_DESKTOP_RUNTIME) {
                void stepLayoutScale(-1);
            }
        },
        onLayoutScaleReset: () => {
            if (IS_DESKTOP_RUNTIME) {
                void setLayoutScale("default");
            }
        },
        onShortcutReference: () => setShortcutsRefOpen((o) => !o),
    });

    // Drive browser notifications from the notification center's computed list
    const { allNotifications } = useNotificationCenter();
    useBrowserNotifications(allNotifications);

    // Sync appearance settings (theme, motion) to the DOM
    useThemeSync();

    // §11.8: Sync diagnostics gate to user's usageDiagnostics setting
    useEffect(() => {
        setDiagnosticsEnabled(settings?.privacy?.usageDiagnostics !== false);
    }, [settings?.privacy?.usageDiagnostics]);

    useEffect(() => {
        const intelligence = settings?.tasks?.intelligence;
        if (intelligence?.nlpEnabled === false || intelligence?.focusViewsEnabled === false) {
            clearActiveFocusView();
        }
    }, [clearActiveFocusView, settings?.tasks?.intelligence?.focusViewsEnabled, settings?.tasks?.intelligence?.nlpEnabled]);

    useEffect(() => {
        setNavOpen(false);
    }, [location.pathname, setNavOpen]);

    // Keep search surfaces coherent across a shell-mode flip (e.g. a window
    // crossing the wide breakpoint): the command palette never lingers below
    // `wide`, and the mobile sheet never lingers on the wide workspace.
    useEffect(() => {
        if (shell.isWide) {
            setMobileSearchOpen(false);
        } else {
            setCommandOpen(false);
        }
    }, [shell.isWide]);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) {
            return;
        }

        const route = `${location.pathname}${location.search}`;
        if (route.startsWith("/auth") || route.startsWith("/desktop/quick-capture")) {
            return;
        }

        void rememberDesktopWorkspaceRoute(route);
    }, [location.pathname, location.search]);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME || location.pathname !== "/" || location.search) {
            return;
        }

        let active = true;

        void readRememberedDesktopWorkspaceRoute().then((route) => {
            if (!active || !route || route === "/") {
                return;
            }

            navigate(route, { replace: true });
        });

        return () => {
            active = false;
        };
    }, [location.pathname, location.search, navigate]);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) {
            return;
        }

        let unlistenCommands: (() => void) | undefined;
        let unlistenQuickCapture: (() => void) | undefined;
        let active = true;

        void listenForDesktopCommands((payload) => {
            if (!active) {
                return;
            }

            switch (payload.command) {
                case "show-command-palette":
                case "show-search":
                    setCommandOpen(true);
                    break;
                case "open-quick-capture":
                    void openQuickCaptureWindow((payload.value as QuickAddTab | undefined) ?? "task");
                    break;
                case "show-settings":
                    navigate(`?settings=${payload.value ?? "account"}`);
                    break;
                case "show-shortcuts":
                    navigate("?settings=shortcuts");
                    break;
                case "show-sync-inspector":
                    setSyncInspectorOpen(true);
                    break;
                case "sync-now":
                    void sync();
                    break;
                case "navigate-capture":
                    navigate("/");
                    break;
                case "navigate-schedule":
                    navigate("/schedule");
                    break;
                case "navigate-habits":
                    navigate("/habits");
                    break;
                case "navigate-weekly-review":
                    navigate("/weekly-review");
                    break;
                case "layout-scale-increase":
                    void stepLayoutScale(1);
                    break;
                case "layout-scale-decrease":
                    void stepLayoutScale(-1);
                    break;
                case "layout-scale-reset":
                    void setLayoutScale("default");
                    break;
            }
        }).then((dispose) => {
            unlistenCommands = dispose;
        });

        void listenForQuickCaptureCompletions((payload) => {
            if (!active) {
                return;
            }

            navigate(payload.route, { replace: false });
        }).then((dispose) => {
            unlistenQuickCapture = dispose;
        });

        return () => {
            active = false;
            unlistenCommands?.();
            unlistenQuickCapture?.();
        };
    }, [navigate, setLayoutScale, stepLayoutScale, sync]);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) {
            return;
        }

        void configureGlobalQuickCaptureShortcut(preferences.quickCaptureShortcutEnabled);
    }, [preferences.quickCaptureShortcutEnabled]);

    const pageMeta = useMemo(() => {
        if (location.pathname.startsWith("/project/")) {
            return {
                title: "Project",
                description: "Work through a focused project view without leaving the Cadence shell.",
            };
        }

        return PAGE_META[location.pathname] ?? {
            title: "Cadence",
            description: "Cadence is a calm planning workspace for tasks, habits, and weekly resets.",
        };
    }, [location.pathname]);
    const controlsSidebarPanel = shell.isPhone || !["/schedule", "/habits"].includes(location.pathname);

    const resolvedPageTitle = pageTitle ?? pageMeta.title;
    const resolvedPageDescription = pageDescription ?? pageMeta.description;

    useDocumentMeta(`${resolvedPageTitle} · Cadence`, resolvedPageDescription);

    if (forceLoading || (requireAuth && (status === "bootstrapping" || status === "refreshing"))) {
        return <Loading />;
    }

    if (requireAuth && status === "recoverable_error") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-twilight px-6">
                <div className="max-w-md rounded-3xl border border-twilight-border bg-twilight-surface/85 p-8 text-center">
                    <h1 className="font-display text-2xl text-twilight-text">Session expired</h1>
                    <p className="mt-3 text-sm text-twilight-text-muted">
                        Your session could not be restored automatically.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-3">
                        <button
                            onClick={() => void beginAuthRecovery()}
                            className="rounded-xl bg-accent-primary/15 px-4 py-2 text-sm font-medium text-accent-primary"
                        >
                            Retry
                        </button>
                        <button
                            onClick={() => navigate("/auth/sign-in", { replace: true })}
                            className="rounded-xl border border-twilight-border px-4 py-2 text-sm text-twilight-text-soft"
                        >
                            Sign in
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (requireAuth && !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-twilight">
                <div className="rounded-3xl border border-twilight-border bg-twilight-surface/80 px-8 py-6 text-center">
                    <p className="text-sm uppercase tracking-[0.2em] text-twilight-text-muted">Redirecting</p>
                    <p className="mt-3 text-sm text-twilight-text-soft">Taking you to sign in.</p>
                </div>
            </div>
        );
    }

    // ── Shared right rail (mutually exclusive context panel ↔ assistant) ──
    const sidePanelPresent = sidePanelActive ?? Boolean(sidePanel);
    // Cadence claims the rail when it owns the active tab, or when there's no
    // contextual panel to compete with.
    const assistantInRail =
        shell.isWide && assistantPanelOpen && (railView === "assistant" || !sidePanelPresent);
    const contextInRail = shell.isWide && sidePanelPresent && !assistantInRail;
    // The toggle rides along while the contextual panel holds the rail — so the
    // user can flip to Cadence (opening it if needed). It hides once Cadence
    // claims the rail, since the assistant's own header X hands the rail back and
    // the toggle would otherwise collide with those controls.
    const railToggleVisible = shell.isWide && sidePanelPresent && !assistantInRail;

    // Selecting "Cadence" opens the assistant if it's closed; the open-state
    // effect above then claims the rail. Selecting the contextual tab just flips
    // the view, leaving the assistant mounted (and hidden) so the thread survives.
    const handleRailViewChange = (next: RailView) => {
        if (next === "assistant" && !assistantPanelOpen) {
            toggleAssistantPanel();
            return;
        }
        setRailView(next);
    };

    const headerTitle = shellHeader?.title ?? resolvedPageTitle;
    const showsRichHeader = Boolean(shellHeader);
    const renderInlinePhoneHeaderRight = shell.isPhone && phoneHeaderRightInline && Boolean(headerRight) && !headerCenter;
    const desktopHeaderRight = IS_DESKTOP_RUNTIME && shell.isDesktop
        ? (
            <DesktopHeaderStatus
                onOpenPrivacySettings={() => navigate("?settings=privacy")}
                onOpenSyncInspector={() => setSyncInspectorOpen(true)}
            />
        )
        : null;

    return (
        <Tooltip.Provider delayDuration={300}>
            <div className="h-dvh bg-twilight overflow-hidden relative">
                <BackgroundLayer />
                <div className="flex h-full relative">
                    {customSidebar !== undefined ? customSidebar : (
                        <Sidebar
                            mode={shell.mode}
                            navOpen={navOpen}
                            onClose={() => setNavOpen(false)}
                            onSearchOpen={openSearch}
                            onQuickAddOpen={() => {
                                setQuickAddInitialTab("task");
                                setQuickAddOpen(true);
                            }}
                        />
                    )}

                    <div className="flex min-w-0 flex-1 flex-col min-h-0">
                    {!hideHeader && (
                        <header className="layer-shell-header shrink-0 border-b border-twilight-border bg-twilight-deep/70 backdrop-blur-xl">
                            <div
                                className="px-4 pb-3 pt-2.5 sm:px-6 sm:pb-3 sm:pt-3 lg:px-8"
                                style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
                            >
                                <div className="flex w-full flex-col gap-2">
                                    <div className="flex min-h-11 items-center justify-between gap-4 sm:min-h-12">
                                        <div className="flex min-w-0 items-center gap-3">
                                            {customSidebar === undefined && (controlsSidebarPanel || !shell.isDesktop) && (
                                                <button
                                                    onClick={shell.isDesktop ? toggleCollapse : () => setNavOpen(true)}
                                                    aria-label={
                                                        shell.isDesktop
                                                            ? isCollapsed
                                                                ? "Expand navigation"
                                                                : "Collapse navigation"
                                                            : "Open navigation"
                                                    }
                                                    aria-expanded={controlsSidebarPanel ? (shell.isDesktop ? !isCollapsed : navOpen) : undefined}
                                                    aria-controls={controlsSidebarPanel ? "sidebar-panel" : undefined}
                                                    className="btn-icon rounded-2xl text-twilight-text-muted hover:bg-white/[0.05] hover:text-twilight-text"
                                                >
                                                    {shell.isDesktop && !isCollapsed
                                                        ? <PanelLeftClose size={18} aria-hidden="true" />
                                                        : <PanelLeftOpen size={18} aria-hidden="true" />
                                                    }
                                                </button>
                                            )}

                                            {showsRichHeader ? (
                                                <div className="relative min-w-0">
                                                    <div className="relative flex min-w-0 items-center gap-3 py-1">
                                                        {shellHeader?.icon ? (
                                                            <div
                                                                className="flex shrink-0 items-center justify-center text-twilight-text"
                                                                style={shellHeader.accentColor ? { color: shellHeader.accentColor } : undefined}
                                                            >
                                                                {shellHeader.icon}
                                                            </div>
                                                        ) : null}
                                                        <div className="flex min-w-0 flex-col gap-px">
                                                            {shellHeader?.eyebrow ? (
                                                                <div className="text-[11px] font-medium uppercase leading-none tracking-[0.16em] text-twilight-text-muted">
                                                                    {shellHeader.eyebrow}
                                                                </div>
                                                            ) : null}
                                                            <h1 className="truncate pb-[0.04em] font-display text-lg font-semibold leading-[1.05] tracking-tight text-twilight-text sm:text-[1.45rem]">
                                                                {headerTitle}
                                                            </h1>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <h1 className="truncate font-display text-lg font-semibold tracking-tight text-twilight-text sm:text-[1.7rem]">
                                                    {resolvedPageTitle}
                                                </h1>
                                            )}
                                        </div>

                                        {((headerCenter || headerRight) && !shell.isPhone) || renderInlinePhoneHeaderRight ? (
                                            <div className="flex shrink-0 items-center gap-2">
                                                {renderInlinePhoneHeaderRight ? headerRight : (
                                                    <>
                                                        {desktopHeaderRight}
                                                        {desktopHeaderRight && (headerCenter || headerRight) ? (
                                                            <div className="h-4 w-px bg-white/[0.08]" aria-hidden="true" />
                                                        ) : null}
                                                        {headerCenter}
                                                        {headerRight}
                                                    </>
                                                )}
                                            </div>
                                        ) : desktopHeaderRight ? (
                                            <div className="flex shrink-0 items-center gap-2">
                                                {desktopHeaderRight}
                                            </div>
                                        ) : null}
                                    </div>

                                    {(headerCenter || headerRight) && shell.isPhone && !renderInlinePhoneHeaderRight && (
                                        <CompactPageControls
                                            primaryControl={headerCenter}
                                            secondaryControl={headerRight}
                                            sticky
                                            compressedOnScroll
                                        />
                                    )}
                                </div>
                            </div>
                        </header>
                    )}

                        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                            {children}
                        </main>
                    </div>

                    {/* ── Shared right rail — shows the contextual panel OR the Cadence
                        assistant, never both. A segmented toggle (rendered only when
                        both are available) flips between them without closing either. ── */}
                    {shell.isWide ? (
                        <div className="relative flex h-full self-stretch shrink-0 items-stretch overflow-hidden">
                            {railToggleVisible ? (
                                <RailViewToggle
                                    view={railView}
                                    onChange={handleRailViewChange}
                                    contextLabel={sidePanelLabel}
                                />
                            ) : null}

                            {/* Contextual panel — always mounted (its own AnimatePresence
                                handles open/close). On a tab flip it crossfades + drifts
                                beneath Cadence: the active pane is in-flow and drives the
                                rail width, the inactive one is lifted out of flow so it
                                never fights for space. */}
                            <motion.div
                                initial={false}
                                animate={{ opacity: contextInRail ? 1 : 0, x: contextInRail ? 0 : -16 }}
                                transition={RAIL_SWITCH_MOTION}
                                style={{
                                    position: contextInRail ? "relative" : "absolute",
                                    inset: contextInRail ? undefined : 0,
                                    zIndex: contextInRail ? 1 : 0,
                                    pointerEvents: contextInRail ? "auto" : "none",
                                    willChange: "transform, opacity",
                                }}
                                className="flex h-full self-stretch items-stretch"
                            >
                                {sidePanel}
                            </motion.div>

                            {/* Cadence — width animates on open/close; its content crossfades
                                on a tab flip. Kept mounted (not unmounted) when the Context
                                tab is active so the conversation thread survives flips. */}
                            <AnimatePresence initial={false}>
                                {assistantPanelOpen ? (
                                    <motion.div
                                        key="assistant-side-panel"
                                        initial={{ width: 0 }}
                                        animate={{ width: assistantPanelWidth + 4 }}
                                        exit={{ width: 0 }}
                                        transition={ASSISTANT_PANEL_MOTION}
                                        style={{
                                            willChange: "width",
                                            overflow: "hidden",
                                            position: assistantInRail ? "relative" : "absolute",
                                            inset: assistantInRail ? undefined : 0,
                                            zIndex: assistantInRail ? 1 : 0,
                                            pointerEvents: assistantInRail ? "auto" : "none",
                                        }}
                                        className="flex h-full self-stretch shrink-0 items-stretch"
                                    >
                                        <motion.div
                                            initial={{ x: 16, opacity: 0 }}
                                            animate={{ x: assistantInRail ? 0 : 16, opacity: assistantInRail ? 1 : 0 }}
                                            transition={RAIL_SWITCH_MOTION}
                                            style={{ willChange: "transform, opacity" }}
                                            className="flex h-full min-w-0 flex-1 items-stretch"
                                        >
                                            <AssistantSidePanel
                                                width={assistantPanelWidth}
                                                onWidthChange={setAssistantPanelWidth}
                                            />
                                        </motion.div>
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>
                        </div>
                    ) : null}

                    {/* On non-wide shells the assistant shares the calendar's
                        mobile surface: a bottom sheet (drag handle + rounded top)
                        on phone/tablet, a side panel on laptop. `fill` lets the
                        chat own its header / scroll / pinned composer. */}
                    {!shell.isWide ? (
                        <ResponsiveOverlayPanel
                            ariaLabel="Cadence assistant"
                            open={assistantPanelOpen}
                            onClose={toggleAssistantPanel}
                            fill
                        >
                            <AssistantSidePanel width={400} isMobile />
                        </ResponsiveOverlayPanel>
                    ) : null}
                </div>
            </div>

            <Suspense fallback={null}>
                <FloatingActionBar />
            </Suspense>
            <Suspense fallback={null}>
                <TaskNoteRoom />
            </Suspense>
            <Suspense fallback={null}>
                <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
            </Suspense>
            <Suspense fallback={null}>
                <MobileSearchSheet open={mobileSearchOpen} onOpenChange={setMobileSearchOpen} />
            </Suspense>
            <Suspense fallback={null}>
                <ShortcutReference open={shortcutsRefOpen} onOpenChange={setShortcutsRefOpen} />
            </Suspense>
            <Suspense fallback={null}>
                <QuickAddSurface open={quickAddOpen} onOpenChange={setQuickAddOpen} initialTab={quickAddInitialTab} />
            </Suspense>
            <Suspense fallback={null}>
                <SettingsDialog />
            </Suspense>
            {IS_DESKTOP_RUNTIME ? (
                <SyncInspectorDialog open={syncInspectorOpen} onOpenChange={setSyncInspectorOpen} />
            ) : null}
            {shell.isPhone && !hideContextualOrb ? (
                <ContextualAddOrb
                    onOpen={(tab) => {
                        setQuickAddInitialTab(tab);
                        setQuickAddOpen(true);
                    }}
                />
            ) : null}
            {/* Mobile/non-wide entry point for Cadence — the icon rail's assistant
                button only mounts on wide shells, so smaller layouts get a FAB.
                Suppressed on the weekly ritual, mirroring the ⌘I hotkey guard. */}
            {!shell.isWide && location.pathname !== "/weekly-review" ? (
                <AssistantLauncher besideOrb={shell.isPhone && !hideContextualOrb} />
            ) : null}
        </Tooltip.Provider>
    );
}
