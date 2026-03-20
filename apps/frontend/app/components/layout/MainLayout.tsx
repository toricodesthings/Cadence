import { Sidebar } from "../sidebar/Sidebar";
import { useNavigate, useLocation } from "react-router";
import * as Tooltip from "../primitives/Tooltip";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSidebarStore } from "../../stores/sidebar-store";
import { useKeyboardShortcuts } from "../../hooks/core/use-keyboard-shortcuts";
import { Loading } from "../shared/Loading";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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

const CommandPalette = lazy(() => import("../command-palette/CommandPalette").then((m) => ({ default: m.CommandPalette })));
const SettingsDialog = lazy(() => import("../settings/SettingsDialog").then((m) => ({ default: m.SettingsDialog })));
const QuickAddSurface = lazy(() => import("../quick-add/QuickAddSurface").then((m) => ({ default: m.QuickAddSurface })));
const FloatingActionBar = lazy(() => import("../tasks/FloatingActionBar").then((m) => ({ default: m.FloatingActionBar })));
const TaskNoteRoom = lazy(() => import("../tasks/TaskNoteRoom").then((m) => ({ default: m.TaskNoteRoom })));

const PAGE_META: Record<string, { title: string; description: string }> = {
    "/": {
        title: "Holding",
        description: "Capture unmanaged work, keep it visible, and sort raw notes without losing calm.",
    },
    "/today": {
        title: "Today",
        description: "Review overdue work and today's commitments in one calm, focused viewer.",
    },
    "/schedule": {
        title: "Schedule",
        description: "View your week, day, month, and year with a calmer scheduling workspace built for focus.",
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

export function MainLayout({
    children,
    requireAuth = false,
    sidePanel,
    headerCenter,
    headerRight,
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
    headerCenter?: React.ReactNode,
    headerRight?: React.ReactNode,
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
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddInitialTab, setQuickAddInitialTab] = useState<QuickAddTab>("task");
    const [forceLoading, setForceLoading] = useState(false);
    const { status, isAuthenticated, beginAuthRecovery } = useAuthState();
    const shell = useShellMode();
    useFocusViews();
    const { data: settings } = useSettings();
    const { view, setView } = useViewMode();
    const clearActiveFocusView = useFocusViewStore((state) => state.clearActiveDefinition);
    const { selectedTaskIds, clearSelection } = useTaskSelectionStore();
    const batchState = useBatchStateTransition();

    useEffect(() => {
        const handleDebugLoading = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setForceLoading(true);
            setTimeout(() => setForceLoading(false), detail?.duration || 10000);
        };
        window.addEventListener("debug:loading", handleDebugLoading);
        return () => window.removeEventListener("debug:loading", handleDebugLoading);
    }, []);

    useKeyboardShortcuts({
        onCommandPalette: () => setCommandOpen((open) => !open),
        onQuickAdd: () => {
            setQuickAddInitialTab("task");
            setQuickAddOpen(true);
        },
        onFocusSearch: () => setCommandOpen(true),
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
    });

    // Drive browser notifications from the notification center's computed list
    const { allNotifications } = useNotificationCenter();
    useBrowserNotifications(allNotifications);

    // Sync appearance settings (theme, motion) to the DOM
    useThemeSync();

    useEffect(() => {
        const intelligence = settings?.tasks?.intelligence;
        if (intelligence?.nlpEnabled === false || intelligence?.focusViewsEnabled === false) {
            clearActiveFocusView();
        }
    }, [clearActiveFocusView, settings?.tasks?.intelligence?.focusViewsEnabled, settings?.tasks?.intelligence?.nlpEnabled]);

    useEffect(() => {
        setNavOpen(false);
    }, [location.pathname, setNavOpen]);

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
                            className="rounded-xl bg-lantern/15 px-4 py-2 text-sm font-medium text-lantern"
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

    const headerTitle = shellHeader?.title ?? resolvedPageTitle;
    const showsRichHeader = Boolean(shellHeader);

    return (
        <Tooltip.Provider delayDuration={300}>
            <div className="h-dvh bg-twilight overflow-hidden">
                <div className="flex h-full">
                    {customSidebar !== undefined ? customSidebar : (
                        <Sidebar
                            mode={shell.mode}
                            navOpen={navOpen}
                            onClose={() => setNavOpen(false)}
                            onSearchOpen={() => setCommandOpen(true)}
                            onQuickAddOpen={() => {
                                setQuickAddInitialTab("task");
                                setQuickAddOpen(true);
                            }}
                        />
                    )}

                    <div className="flex min-w-0 flex-1 flex-col min-h-0">
                    {!hideHeader && (
                        <header className="shrink-0 z-30 border-b border-twilight-border bg-twilight-deep/70 backdrop-blur-xl">
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

                                        {(headerCenter || headerRight) && !shell.isPhone && (
                                            <div className="flex shrink-0 items-center gap-2">
                                                {headerCenter}
                                                {headerRight}
                                            </div>
                                        )}
                                    </div>

                                    {(headerCenter || headerRight) && shell.isPhone && (
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

                    {shell.isWide ? sidePanel : null}
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
                <QuickAddSurface open={quickAddOpen} onOpenChange={setQuickAddOpen} initialTab={quickAddInitialTab} />
            </Suspense>
            <Suspense fallback={null}>
                <SettingsDialog />
            </Suspense>
            {shell.isPhone && !hideContextualOrb ? (
                <ContextualAddOrb
                    onOpen={(tab) => {
                        setQuickAddInitialTab(tab);
                        setQuickAddOpen(true);
                    }}
                />
            ) : null}
        </Tooltip.Provider>
    );
}
