import { Button } from "../primitives/Button";
import { Sidebar } from "../sidebar/Sidebar";
import { IconRail } from "../sidebar/IconRail";
import { NotificationPreview } from "../notifications/NotificationPreview";
import { MobileHeaderActions, MobileTabBar } from "./MobileNavigation";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router";
import * as Tooltip from "../primitives/Tooltip";
import { Download, Menu, PanelLeftClose, PanelLeftOpen, PanelRightClose } from "lucide-react";
import { useNavPanel } from "../../hooks/ui/use-nav-panel";
import { useAssistantStore } from "../../stores/assistant-store";
import { useAssistantReplyWatcher } from "../../hooks/ai/use-assistant-reply-watcher";
import { useRightPanelStore, type RailView } from "../../stores/right-panel-store";
import { ResponsiveOverlayPanel } from "../shared/ResponsiveOverlayPanel";
import { RailViewToggle } from "./RailViewToggle";
import { useKeyboardShortcuts } from "../../hooks/core/use-keyboard-shortcuts";
import { Loading } from "../shared/Loading";
import { DeferredMount } from "../shared/DeferredMount";
import { FindTimeSheet } from "../tasks/FindTimeSheet";
import { useFindTimeStore } from "../../stores/find-time-store";
import type { CSSProperties } from "react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useOfflineWindow } from "../../hooks/core/use-offline-window";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useDocumentTitle } from "../../hooks/core/use-document-title";
import { useFocusViews } from "../../hooks/core/use-focus-views";
import { useSettings } from "../../hooks/core/use-settings";
import { useNotificationCenter } from "../../hooks/notifications/use-notification-center";
import { useBrowserNotifications } from "../../hooks/notifications/use-browser-notifications";
import { useNotificationTapRouting } from "../../hooks/notifications/use-open-notification";
import { useInstalledApp } from "../../hooks/ui/use-installed-app";
import { useWakeRefresh } from "../../hooks/core/use-wake-refresh";
import { useThemeSync } from "../../hooks/ui/use-theme-sync";
import { useZoneSync } from "../../hooks/core/use-zone-sync";
import { useViewMode } from "../../hooks/ui/use-view-mode";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { useTaskSelectionStore } from "../../stores/task-selection-store";
import { useNoteRoomStore } from "../../stores/note-room-store";
import { useBatchStateTransition, useTrashTasks } from "../../hooks/tasks/use-batch-state";
import { CompactPageControls } from "../shared/CompactPageControls";
import { PAGE_HEADER_SURFACE, PageHeader, PageHeaderIdentity, PhonePageHeader } from "./PageHeader";
import { ContextualAddOrb } from "../shared/ContextualAddOrb";
import type { QuickAddTab } from "../quick-add/QuickAddSurface";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { useAvailableDesktopUpdate } from "../../platform/desktop-update-state";
import { DESKTOP_LAYOUT_SCALE_DEFAULT, useDesktopLayoutScale } from "../../hooks/ui/use-desktop-layout-scale";
import { HeaderMenuClaimProvider, HeaderScaleMenu } from "./LayoutScaleMenu";
import { LegalConsentGate } from "../legal/LegalConsentGate";
import { SyncInspectorDialog } from "../desktop/SyncInspectorDialog";
import { useWorkspaceSync } from "../../hooks/core/use-workspace-sync";
import type { Season } from "../../lib/themes/season";
import {
    configureGlobalQuickCaptureShortcut,
    listenForDesktopCommands,
    listenForQuickCaptureCompletions,
    openQuickCaptureWindow,
    readRememberedDesktopWorkspaceRoute,
    rememberDesktopWorkspaceRoute,
    takeLaunchCommand,
    type DesktopCommandPayload,
} from "../../platform/desktop-shell";
import { useDesktopCommandPreferences } from "../../hooks/ui/use-desktop-command-preferences";

const CommandPalette = lazy(() => import("../command-palette/CommandPalette").then((m) => ({ default: m.CommandPalette })));
const AssistantSidePanel = lazy(() => import("../assistant/AssistantSidePanel").then((m) => ({ default: m.AssistantSidePanel })));
const MobileSearchSheet = lazy(() => import("../command-palette/MobileSearchSheet").then((m) => ({ default: m.MobileSearchSheet })));
const ShortcutReference = lazy(() => import("../shared/ShortcutReference").then((m) => ({ default: m.ShortcutReference })));
const WorkspaceMenuSheet = lazy(() => import("./WorkspaceMenuSheet").then((m) => ({ default: m.WorkspaceMenuSheet })));
const NotificationsSheet = lazy(() => import("../notifications/NotificationsSheet").then((m) => ({ default: m.NotificationsSheet })));
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

const PAGE_TITLES: Record<string, string> = {
    "/": "Capture",
    "/today": "Today",
    "/schedule": "Schedule",
    "/events": "Events",
    "/upcoming": "Upcoming",
    "/completed": "Completed",
    "/trash": "Trash",
    "/routines": "Routines",
    "/weekly-review": "Weekly Reset",
};

/** The assistant panel's glass surface, shown while its code loads. */
function AssistantShell({ width }: { width?: number }) {
    return <div aria-hidden="true" style={width ? { width } : undefined} className={`surface-shell h-full shrink-0 ${width ? "photo-shell-surface" : "w-full"}`} />;
}

interface ShellHeaderConfig {
    title?: React.ReactNode;
    eyebrow?: React.ReactNode;
    icon?: React.ReactNode;
    accentColor?: string;
}

export function MainLayout({
    children,
    requireAuth = false,
    sidePanel,
    sidePanelActive,
    onCloseSidePanel,
    sidePanelLabel = "Panel",
    headerCenter,
    headerRight,
    compactHeaderRightInline = false,
    compactHeaderLeading,
    customSidebar,
    hideHeader = false,
    hideContextualOrb = false,
    navigationMode = "workspace",
    pageTitle,
    shellHeader,
}: {
    children: React.ReactNode,
    requireAuth?: boolean,
    sidePanel?: React.ReactNode,
    /** Whether the contextual panel currently has something to show. When false,
     * the rail's "Context" tab is suppressed and the assistant gets the rail
     * outright. Defaults to `Boolean(sidePanel)`. */
    sidePanelActive?: boolean,
    onCloseSidePanel?: () => void,
    /** Label for the contextual tab in the rail toggle (e.g. "Calendar", "Review"). */
    sidePanelLabel?: string,
    headerCenter?: React.ReactNode,
    headerRight?: React.ReactNode,
    compactHeaderRightInline?: boolean,
    /** Compact-shell-only control rendered before the page identity, replacing
     * the workspace menu button every compact route gets by default. */
    compactHeaderLeading?: React.ReactNode,
    customSidebar?: React.ReactNode,
    hideHeader?: boolean,
    hideContextualOrb?: boolean,
    /** Focused pages keep only the shared icon rail, at every shell size. */
    navigationMode?: "workspace" | "rail",
    pageTitle?: string,
    shellHeader?: ShellHeaderConfig,
}) {
    const navigate = useNavigate();
    const location = useLocation();
    const navPanel = useNavPanel();
    const [commandOpen, setCommandOpen] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
    const [shortcutsRefOpen, setShortcutsRefOpen] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddInitialTab, setQuickAddInitialTab] = useState<QuickAddTab>("task");
    const [syncInspectorOpen, setSyncInspectorOpen] = useState(false);
    const [forceLoading, setForceLoading] = useState(false);
    const { status, isAuthenticated, beginAuthRecovery } = useAuthState();
    const shell = useShellMode();
    const desktopUpdate = useAvailableDesktopUpdate();
    const [headerMenus, setHeaderMenus] = useState(0);
    const claimHeaderMenu = useCallback(() => {
        setHeaderMenus((count) => count + 1);
        return () => setHeaderMenus((count) => count - 1);
    }, []);
    // Rail mode is a wide-screen layout; compact screens keep the phone header and dock.
    const railOnly = navigationMode === "rail" && !shell.isCompact;
    const isUtilityPage = location.pathname === "/browse";
    const { assistantPanelOpen, assistantPanelWidth, setAssistantPanelWidth, toggleAssistantPanel } = useAssistantStore();
    useAssistantReplyWatcher();
    const { railView, setRailView } = useRightPanelStore();
    const handleAssistantToggle = useCallback(() => {
        if (railOnly) {
            navigate("/");
            if (assistantPanelOpen) return;
        }
        toggleAssistantPanel();
    }, [assistantPanelOpen, navigate, railOnly, toggleAssistantPanel]);

    // The rail is mutually exclusive. Opening the assistant claims the rail
    // (Cadence tab); closing it hands the rail back to the contextual panel.
    // Manual tab switches (via the segmented toggle) aren't disturbed because
    // this only fires when the assistant's open state actually changes.
    useEffect(() => {
        setRailView(assistantPanelOpen ? "assistant" : "context");
    }, [assistantPanelOpen, setRailView]);

    // Opening a contextual panel (e.g. task details) claims the rail on top of
    // Cadence; closing it hands the rail back to the assistant if it's open.
    const contextPanelPresent = sidePanelActive ?? Boolean(sidePanel);
    useEffect(() => {
        if (contextPanelPresent) setRailView("context");
        else if (useAssistantStore.getState().assistantPanelOpen) setRailView("assistant");
    }, [contextPanelPresent, setRailView]);

    // Compact has no global tag filter: a `?tag=` deep link opens that tag's page instead.
    const deepLinkTag = shell.isCompact ? new URLSearchParams(location.search).get("tag") : null;
    useEffect(() => {
        if (deepLinkTag) navigate(`/tag/${encodeURIComponent(deepLinkTag)}`, { replace: true });
    }, [deepLinkTag, navigate]);
    useFocusViews();
    useOfflineWindow();
    const { data: settings } = useSettings();
    const { view, setView } = useViewMode();
    const clearActiveFocusView = useFocusViewStore((state) => state.clearActiveDefinition);
    const { selectedTaskIds, clearSelection } = useTaskSelectionStore();
    const noteRoomOpen = useNoteRoomStore((state) => state.taskId !== null);
    const findTimeOpen = useFindTimeStore((state) => state.request !== null);
    const batchState = useBatchStateTransition();
    const trashTasks = useTrashTasks();
    const { stepLayoutScale, setLayoutScale } = useDesktopLayoutScale();
    const { sync } = useWorkspaceSync();
    const { preferences } = useDesktopCommandPreferences();

    useEffect(() => {
        // Dev preview: stays up until Escape, or for `detail.duration` ms when given.
        // `detail.season` previews that season; the real one is restored on close.
        let timer: ReturnType<typeof setTimeout> | undefined;
        let realSeason: string | null | undefined;
        const root = document.documentElement;
        const restoreSeason = () => {
            if (realSeason === undefined) return;
            if (realSeason === null) root.removeAttribute("data-loading-season");
            else root.setAttribute("data-loading-season", realSeason);
            realSeason = undefined;
        };
        const hide = () => {
            setForceLoading(false);
            restoreSeason();
        };
        const handleDebugLoading = (e: Event) => {
            const detail = (e as CustomEvent<{ duration?: number; season?: Season } | undefined>).detail;
            if (detail?.season) {
                if (realSeason === undefined) realSeason = root.getAttribute("data-loading-season");
                root.setAttribute("data-loading-season", detail.season);
            } else {
                restoreSeason();
            }
            setForceLoading(true);
            clearTimeout(timer);
            if (detail?.duration) timer = setTimeout(hide, detail.duration);
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") hide();
        };
        window.addEventListener("debug:loading", handleDebugLoading);
        window.addEventListener("keydown", handleEscape);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("debug:loading", handleDebugLoading);
            window.removeEventListener("keydown", handleEscape);
        };
    }, []);

    // Global assistant shortcut (⌘/Ctrl + I) — invokable from anywhere except the
    // Weekly Reset ritual, where the focused step flow owns the keyboard.
    useEffect(() => {
        const handleAssistantHotkey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "i") {
                if (location.pathname === "/weekly-review") return;
                e.preventDefault();
                handleAssistantToggle();
            }
        };
        window.addEventListener("keydown", handleAssistantHotkey);
        return () => window.removeEventListener("keydown", handleAssistantHotkey);
    }, [handleAssistantToggle, location.pathname]);

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
                { onSuccess: clearSelection },
            );
        },
        onArchiveTask: () => {
            const ids = Array.from(selectedTaskIds);
            if (ids.length === 0) return;
            trashTasks(ids, clearSelection);
        },
        onLayoutScaleIncrease: () => IS_DESKTOP_RUNTIME && void stepLayoutScale(1),
        onLayoutScaleDecrease: () => IS_DESKTOP_RUNTIME && void stepLayoutScale(-1),
        onLayoutScaleReset: () => IS_DESKTOP_RUNTIME && void setLayoutScale(DESKTOP_LAYOUT_SCALE_DEFAULT),
        onShortcutReference: () => setShortcutsRefOpen((o) => !o),
    });

    // Local alerts from the notification center's list (devices the server can't push to) and taps on pushed reminders
    const { allNotifications, unreadCount } = useNotificationCenter();
    useBrowserNotifications(allNotifications);
    useNotificationTapRouting();
    useInstalledApp(unreadCount);

    // Sync appearance settings (theme, motion) to the DOM
    useThemeSync();
    useZoneSync();
    useWakeRefresh();


    useEffect(() => {
        const intelligence = settings?.tasks?.intelligence;
        if (intelligence?.nlpEnabled === false || intelligence?.focusViewsEnabled === false) {
            clearActiveFocusView();
        }
    }, [clearActiveFocusView, settings?.tasks?.intelligence?.focusViewsEnabled, settings?.tasks?.intelligence?.nlpEnabled]);

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

        const handleCommand = ({ command, value }: DesktopCommandPayload) => {
            if (!active) return;
            const actions: Partial<Record<DesktopCommandPayload["command"], () => unknown>> = {
                "show-command-palette": () => setCommandOpen(true),
                "show-search": () => setCommandOpen(true),
                "open-quick-capture": () => openQuickCaptureWindow((value as QuickAddTab | undefined) ?? "task"),
                "show-settings": () => navigate(`?settings=${value ?? "account"}`),
                "show-shortcuts": () => navigate("?settings=shortcuts"),
                "show-sync-inspector": () => setSyncInspectorOpen(true),
                "sync-now": () => sync(),
                "navigate-capture": () => navigate("/"),
                "navigate-schedule": () => navigate("/schedule"),
                "navigate-habits": () => navigate("/routines"),
                "navigate-weekly-review": () => navigate("/weekly-review"),
                "layout-scale-increase": () => stepLayoutScale(1),
                "layout-scale-decrease": () => stepLayoutScale(-1),
                "layout-scale-reset": () => setLayoutScale(DESKTOP_LAYOUT_SCALE_DEFAULT),
            };
            void actions[command]?.();
        };

        void listenForDesktopCommands(handleCommand).then(async (dispose) => {
            unlistenCommands = dispose;
            // A Jump List launch that started Cadence: its command waited for this listener.
            const pending = await takeLaunchCommand();
            if (pending) handleCommand(pending);
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

    const controlsSidebarPanel = shell.isPhone || !["/schedule", "/routines", "/events"].includes(location.pathname);

    const resolvedPageTitle = pageTitle ?? (location.pathname.startsWith("/project/") ? "List" : PAGE_TITLES[location.pathname] ?? "Cadence");
    useDocumentTitle(`${resolvedPageTitle} · Cadence`);

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
    const sidePanelPresent = contextPanelPresent;
    // Cadence claims the rail when it owns the active tab, or when there's no
    // contextual panel to compete with.
    const assistantInRail =
        shell.isWide && assistantPanelOpen && (railView === "assistant" || !sidePanelPresent);
    // Not gated on `sidePanelPresent`: the context pane must stay in-flow while
    // it closes so its own exit (width → 0) animates instead of snapping shut.
    const contextInRail = shell.isWide && !assistantInRail;
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
    const desktopApp = IS_DESKTOP_RUNTIME && shell.isDesktop;
    // The update notice stays in the header; the layout scale lives in the ⋮ (`LayoutScaleMenu`).
    const desktopStatus = desktopApp && desktopUpdate ? (
        <button type="button" onClick={() => navigate("?settings=about")}
            className="hidden h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border surface-control-accent border-accent-primary/25 px-3 text-[13px] font-medium text-accent-primary transition-colors lg:flex">
            <Download size={14} aria-hidden="true" />
            Update {desktopUpdate.version}
        </button>
    ) : null;
    // The layout scale sits in the page's ⋮; a page without one gets a ⋮ holding just the scale.
    const scaleMenu = desktopApp && headerMenus === 0 ? <HeaderScaleMenu /> : null;

    const headerIdentityProps = {
        title: headerTitle,
        eyebrow: shellHeader?.eyebrow,
        icon: shellHeader?.icon,
        accentColor: shellHeader?.accentColor,
    };
    /* Compact shells have no sidebar, so every route keeps the workspace menu
       (Today, Upcoming, projects, tags) one tap away from the header. */
    const workspaceMenuButton = compactHeaderLeading ?? (
        <Tooltip.Tip label="Workspace menu"><button
            type="button"
            onClick={() => setWorkspaceMenuOpen(true)}
            aria-label="Open workspace menu"
            aria-haspopup="dialog"
            aria-expanded={workspaceMenuOpen}
            className="mobile-icon-button shrink-0"
        ><Menu size={20} aria-hidden="true" /></button></Tooltip.Tip>
    );
    const compactHeaderActions = <MobileHeaderActions onSearch={openSearch}>{compactHeaderRightInline ? headerRight : null}</MobileHeaderActions>;
    const compactControls = (headerCenter || (headerRight && !compactHeaderRightInline)) ? (
        <CompactPageControls
            primaryControl={headerCenter}
            secondaryControl={compactHeaderRightInline ? undefined : headerRight}
            sticky
            compressedOnScroll
        />
    ) : null;

    const canCloseRail = shell.isWide && location.pathname !== "/" &&
        (assistantInRail || (sidePanelPresent && Boolean(onCloseSidePanel)));
    const closeRailControl = canCloseRail ? (
        <Tooltip.Tip label="Close side panel" side="bottom">
            <Button variant="ghost" size="icon"
                type="button"
                aria-label="Close side panel"
                className="btn-icon rounded-2xl"
                onClick={() => {
                    onCloseSidePanel?.();
                    if (assistantPanelOpen) toggleAssistantPanel();
                }}
            >
                <PanelRightClose size={18} aria-hidden="true" />
            </Button>
        </Tooltip.Tip>
    ) : null;

    const hasHeaderActions = Boolean(desktopStatus || headerCenter || headerRight || scaleMenu || shell.isLaptop || closeRailControl);
    const headerActions = hasHeaderActions ? (
        <>
            {desktopStatus}
            {desktopStatus && (headerCenter || headerRight) ? (
                <div className="h-4 w-px bg-white/[0.08]" aria-hidden="true" />
            ) : null}
            {headerCenter}
            {headerRight}
            {scaleMenu}
            {shell.isLaptop && <NotificationPreview side="bottom" placement="header" />}
            {closeRailControl}
        </>
    ) : null;

    return (
        <HeaderMenuClaimProvider value={claimHeaderMenu}>
            {/* Compact headers pad under the iOS status bar themselves; the wide shell
                (iPad landscape home-screen app) starts below it. Zero elsewhere. */}
            <div className={`h-dvh overflow-hidden relative ${shell.isCompact && !railOnly ? "compact-navigation-shell" : "pt-[env(safe-area-inset-top)]"}`}>
                <div className="flex h-full relative">
                    {railOnly ? (
                        <aside className="layer-shell-base h-full shrink-0 overflow-y-auto scrollbar-none safe-bottom" aria-label="Application navigation">
                            <IconRail
                                className="h-auto min-h-full"
                                onSearchOpen={openSearch}
                                onQuickAddOpen={() => {
                                    setQuickAddInitialTab("task");
                                    setQuickAddOpen(true);
                                }}
                                onAssistantOpen={handleAssistantToggle}
                            />
                        </aside>
                    ) : shell.isCompact ? null : customSidebar !== undefined ? customSidebar : (
                        <Sidebar
                            mode={shell.mode}
                            onSearchOpen={openSearch}
                            onQuickAddOpen={() => {
                                setQuickAddInitialTab("task");
                                setQuickAddOpen(true);
                            }}
                        />
                    )}

                    <div className="flex min-w-0 flex-1 flex-col min-h-0">
                    {/* Off phone the header is a single row, so it takes the shared
                        height and its bottom border lines up with side-panel headers. */}
                    {!hideHeader && !railOnly && (shell.isPhone ? (
                        <PhonePageHeader eyebrow={shellHeader?.eyebrow} title={headerTitle} leading={workspaceMenuButton} actions={compactHeaderActions}>
                            {compactControls}
                        </PhonePageHeader>
                    ) : shell.isCompact ? (
                        <header className={PAGE_HEADER_SURFACE}>
                            <div className="safe-header-top px-4 pb-3">
                                <div className="flex w-full flex-col gap-2">
                                    <div className="flex min-h-11 items-center justify-between gap-3 sm:min-h-12">
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <span className="-ml-1">{workspaceMenuButton}</span>
                                            <PageHeaderIdentity {...headerIdentityProps} />
                                        </div>
                                        {compactHeaderActions}
                                    </div>
                                    {compactControls}
                                </div>
                            </div>
                        </header>
                    ) : (
                        <PageHeader
                            {...headerIdentityProps}
                            leading={customSidebar === undefined && shell.isDesktop && controlsSidebarPanel ? (
                                <Button variant="ghost" size="icon"
                                    onClick={navPanel.toggle}
                                    aria-label={navPanel.open ? "Collapse navigation" : "Expand navigation"}
                                    aria-expanded={navPanel.open}
                                    aria-controls="sidebar-panel"
                                    className="btn-icon -ml-2 rounded-2xl"
                                >
                                    {!navPanel.open
                                        ? <PanelLeftOpen size={18} aria-hidden="true" />
                                        : <PanelLeftClose size={18} aria-hidden="true" />
                                    }
                                </Button>
                            ) : undefined}
                            actions={headerActions}
                        />
                    ))}

                        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                            {children}
                        </main>
                        {shell.isCompact && !railOnly && <MobileTabBar />}
                    </div>

                    {/* ── Shared right rail — shows the contextual panel OR the Cadence
                        assistant, never both. A segmented toggle (rendered only when
                        both are available) flips between them without closing either. ── */}
                    {shell.isWide && !railOnly ? (
                        <div
                            className="relative flex h-full self-stretch shrink-0 items-stretch overflow-hidden"
                            // Panel headers pad their right edge by this so the floating
                            // view toggle never covers their own actions.
                            style={{ "--rail-toggle-reserve": railToggleVisible ? "5.5rem" : "0px" } as CSSProperties}
                        >
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
                                            {/* Optional, even when persisted open: never part of startup.
                                                The glass shell holds the rail at reveal; the chat fills in. */}
                                            <Suspense fallback={<AssistantShell width={assistantPanelWidth + 4} />}>
                                                <AssistantSidePanel
                                                    width={assistantPanelWidth}
                                                    onWidthChange={setAssistantPanelWidth}
                                                />
                                            </Suspense>
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
                    {!shell.isWide && !railOnly ? (
                        <ResponsiveOverlayPanel
                            ariaLabel="Cadence assistant"
                            open={assistantPanelOpen}
                            onClose={toggleAssistantPanel}
                            fill
                        >
                            <Suspense fallback={<AssistantShell />}>
                                <AssistantSidePanel width={400} isMobile />
                            </Suspense>
                        </ResponsiveOverlayPanel>
                    ) : null}
                </div>
            </div>

            <DeferredMount active={!railOnly && selectedTaskIds.size > 0}><FloatingActionBar /></DeferredMount>
            <DeferredMount active={!railOnly && noteRoomOpen}><TaskNoteRoom /></DeferredMount>
            <DeferredMount active={findTimeOpen}><FindTimeSheet /></DeferredMount>
            <DeferredMount active={commandOpen}><CommandPalette open={commandOpen} onOpenChange={setCommandOpen} /></DeferredMount>
            <DeferredMount active={workspaceMenuOpen}><WorkspaceMenuSheet open={workspaceMenuOpen} onClose={() => setWorkspaceMenuOpen(false)} /></DeferredMount>
            <DeferredMount active={mobileSearchOpen}><MobileSearchSheet open={mobileSearchOpen} onOpenChange={setMobileSearchOpen} /></DeferredMount>
            <DeferredMount active={shortcutsRefOpen}><ShortcutReference open={shortcutsRefOpen} onOpenChange={setShortcutsRefOpen} /></DeferredMount>
            <DeferredMount active={quickAddOpen}><QuickAddSurface open={quickAddOpen} onOpenChange={setQuickAddOpen} initialTab={quickAddInitialTab} /></DeferredMount>
            <DeferredMount active={new URLSearchParams(location.search).has("settings")}><SettingsDialog /></DeferredMount>
            <LegalConsentGate />
            <DeferredMount active={new URLSearchParams(location.search).has("notifications")}><NotificationsSheet /></DeferredMount>
            {IS_DESKTOP_RUNTIME ? (
                <SyncInspectorDialog open={syncInspectorOpen} onOpenChange={setSyncInspectorOpen} />
            ) : null}
            {shell.isPhone && !railOnly && !hideContextualOrb && !isUtilityPage ? (
                <ContextualAddOrb
                    onOpen={(tab) => {
                        setQuickAddInitialTab(tab);
                        setQuickAddOpen(true);
                    }}
                />
            ) : null}
        </HeaderMenuClaimProvider>
    );
}
