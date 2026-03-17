import { useEffect, useMemo, useState } from "react";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { AlertTriangle, CalendarClock, EyeOff, Eye, PanelRightClose, Sunrise } from "lucide-react";
import { MainLayout } from "../components/layout/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { BucketedCollectionView } from "../components/shared/BucketedCollectionView";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { TaskList } from "../components/tasks/TaskList";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { PageContent } from "../components/layout/PageLayout";
import { ViewToggle } from "../components/shared/ViewToggle";
import { SortMenu } from "../components/shared/SortMenu";
import { ControlsSheet } from "../components/shared/ControlsSheet";
import { useTasks } from "../hooks/tasks";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useViewMode } from "../hooks/ui/use-view-mode";
import { useSortMode } from "../hooks/ui/use-sort-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { toISODate } from "../lib/utils/date-format";
import { getTaskTimelineAnchor, isPassiveTimetableTask } from "../lib/utils/task-scheduling";
import { sortTasks } from "../lib/utils/sort-tasks";
import type { Task } from "../types/task";

const TIMETABLE_VISIBILITY_STORAGE_KEY = "cadence-today-hide-timetable-anchors";

export default function TodayRoute() {
    const shell = useShellMode();
    const { view, setView } = useViewMode();
    const { sortMode, setSortMode } = useSortMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const [hideTimetableAnchors, setHideTimetableAnchors] = useState(false);
    const todayISO = toISODate(new Date());
    const { activeTagId } = useTagFilterStore();

    useDocumentMeta(
        "Today · Cadence",
        "Review overdue work and today's commitments in one calm, focused viewer.",
    );

    useRouteFocus();

    useEffect(() => {
        if (typeof window === "undefined") return;
        setHideTimetableAnchors(window.localStorage.getItem(TIMETABLE_VISIBILITY_STORAGE_KEY) === "1");
    }, []);

    const { data: tasks = [], isLoading } = useTasks({
        state: "ACTIVE",
        effectiveOnOrBeforeDate: todayISO,
    });

    const filteredTasks = useMemo(
        () => (activeTagId ? tasks.filter((task) => task.tagIds?.includes(activeTagId)) : tasks),
        [activeTagId, tasks],
    );

    const grouped = useMemo(() => {
        const overdue: Task[] = [];
        const today: Task[] = [];
        const timetableAnchors: Task[] = [];

        for (const task of filteredTasks) {
            const anchor = getTaskTimelineAnchor(task);
            if (!anchor) continue;
            if (isPassiveTimetableTask(task)) {
                if (anchor === todayISO) {
                    timetableAnchors.push(task);
                }
                continue;
            }
            if (anchor < todayISO) overdue.push(task);
            if (anchor === todayISO) today.push(task);
        }

        return {
            overdue: sortTasks(overdue, sortMode),
            today: sortTasks(today, sortMode),
            timetableAnchors: sortTasks(timetableAnchors, sortMode),
        };
    }, [filteredTasks, todayISO, sortMode]);

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId((current) => (current === taskId ? null : taskId));
        if (!shell.isWide) {
            setMobileDetailMode("peek");
            setMobilePanelOpen(true);
        }
    };

    const sidePanel = selectedTaskId ? (
        <ResizableSidePanel ariaLabel="Resize today sidebar">
            <TaskEditPanel
                key={`today-edit-${selectedTaskId}`}
                taskId={selectedTaskId}
                onClose={() => setSelectedTaskId(null)}
            />
        </ResizableSidePanel>
    ) : null;

    const sortOptions = [
        { value: "smart", label: "Smart" },
        { value: "priority", label: "Priority" },
        { value: "manual", label: "Manual" },
    ] as const;

    const headerRight = shell.isPhone ? (
        <ControlsSheet
            routeKey="today"
            title="Today controls"
            sections={[
                {
                    id: "view",
                    label: "View",
                    content: (
                        <div className="space-y-3">
                            <p className="text-sm text-twilight-text-soft">Switch between list and board without leaving the page.</p>
                            <ViewToggle view={view} onViewChange={setView} compact />
                        </div>
                    ),
                },
                {
                    id: "sort",
                    label: "Sort",
                    content: (
                        <div className="space-y-2">
                            {sortOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setSortMode(option.value)}
                                    className={`touch-target flex min-h-11 w-full items-center justify-between rounded-2xl border px-4 text-sm font-medium ${
                                        sortMode === option.value
                                            ? "border-lantern/30 bg-lantern/14 text-lantern"
                                            : "border-twilight-border/40 bg-white/[0.03] text-twilight-text-soft"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    ),
                },
                {
                    id: "details",
                    label: "Details",
                    content: selectedTaskId ? (
                        <button
                            type="button"
                            onClick={() => setMobilePanelOpen(true)}
                            className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-twilight-border/40 bg-white/[0.03] px-4 text-sm font-medium text-twilight-text-soft"
                        >
                            <PanelRightClose size={16} aria-hidden="true" />
                            Open task details
                        </button>
                    ) : (
                        <p className="text-sm text-twilight-text-muted">Open a task to reveal its peek and focus editor.</p>
                    ),
                },
            ]}
        />
    ) : (!shell.isWide && selectedTaskId) ? (
        <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-twilight-border px-4 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
            aria-label="Open task details"
        >
            <PanelRightClose size={16} aria-hidden="true" />
            Details
        </button>
    ) : undefined;

    const visibleTimetableAnchors = hideTimetableAnchors ? [] : grouped.timetableAnchors;
    const totalVisible = grouped.overdue.length + grouped.today.length + visibleTimetableAnchors.length;

    const toggleTimetableAnchors = () => {
        setHideTimetableAnchors((current) => {
            const next = !current;
            if (typeof window !== "undefined") {
                window.localStorage.setItem(TIMETABLE_VISIBILITY_STORAGE_KEY, next ? "1" : "0");
            }
            return next;
        });
    };

    const renderTaskBucket = (tasks: Task[], cardVariant?: "list" | "board", emptyLabel?: string) => {
        if (tasks.length > 0) {
            return (
                <TaskList
                    tasks={tasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={handleSelectTask}
                    {...(cardVariant ? { cardVariant } : {})}
                />
            );
        }

        return (
            <div className="px-6 py-3 text-[13px] italic text-twilight-text-muted/65">
                {emptyLabel}
            </div>
        );
    };

    const sections = [
        {
            key: "overdue",
            title: "Overdue",
            icon: AlertTriangle,
            accentClass: "text-[var(--color-priority-urgent)]",
            count: grouped.overdue.length,
            listContent: renderTaskBucket(grouped.overdue, undefined, "Nothing in overdue."),
            boardContent: renderTaskBucket(grouped.overdue, "board", "Nothing in overdue."),
        },
        {
            key: "today",
            title: "Today",
            icon: Sunrise,
            accentClass: "text-lantern",
            count: grouped.today.length,
            listContent: renderTaskBucket(grouped.today, undefined, "Nothing in today."),
            boardContent: renderTaskBucket(grouped.today, "board", "Nothing in today."),
        },
        {
            key: "timetable-anchors",
            title: "Timetable anchors",
            icon: CalendarClock,
            accentClass: "text-moonlit",
            count: visibleTimetableAnchors.length,
            description: "Recurring anchors stay visible here without blending into today’s check-off work.",
            headerAction: (
                <button
                    type="button"
                    onClick={toggleTimetableAnchors}
                    className="touch-target inline-flex min-h-11 items-center gap-2 rounded-2xl border border-moonlit/20 bg-moonlit/10 px-4 text-xs font-medium uppercase tracking-[0.14em] text-moonlit"
                    aria-pressed={hideTimetableAnchors}
                >
                    {hideTimetableAnchors ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                    {hideTimetableAnchors ? "Show" : "Hide"}
                </button>
            ),
            listSectionClassName: "rounded-[28px] border border-moonlit/20 bg-moonlit/[0.08] px-4 py-4 shadow-[0_18px_60px_rgba(7,14,26,0.18)]",
            boardSectionClassName: "border-moonlit/25 bg-moonlit/[0.08]",
            listContent: renderTaskBucket(
                visibleTimetableAnchors,
                undefined,
                hideTimetableAnchors ? "Timetable anchors are hidden." : "No timetable anchors for today.",
            ),
            boardContent: renderTaskBucket(
                grouped.timetableAnchors,
                "board",
                "No timetable anchors for today.",
            ),
        },
    ];

    return (
        <MainLayout
            requireAuth
            sidePanel={sidePanel}
            headerCenter={<ViewToggle view={view} onViewChange={setView} />}
            headerRight={
                shell.isPhone ? (
                    headerRight
                ) : (
                    <div className="flex items-center gap-2">
                        {headerRight}
                        <SortMenu mode={sortMode} onModeChange={setSortMode} />
                    </div>
                )
            }
            contentWidth="default"
            shellHeader={{
                title: "Today",
                eyebrow: "Focus",
                icon: <Sunrise size={18} aria-hidden="true" />,
                accentColor: "var(--color-nav-planner)",
            }}
        >
            {view === "kanban" ? (
                <div className="flex-1 min-h-0 min-w-0">
                    {isLoading ? (
                        <PageContent width="default">
                            <TaskListSkeleton />
                        </PageContent>
                    ) : totalVisible > 0 ? (
                        <BucketedCollectionView
                            view={view}
                            sections={sections.filter((section) => section.key !== "timetable-anchors" || !hideTimetableAnchors)}
                        />
                    ) : (
                        <PageContent width="default">
                            <EmptyState variant="today" />
                        </PageContent>
                    )}
                </div>
            ) : (
                <ScrollAreaWrapper>
                    <PageContent width="default">
                        {isLoading ? (
                            <TaskListSkeleton />
                        ) : totalVisible > 0 ? (
                            <BucketedCollectionView
                                view={view}
                                sections={sections}
                            />
                        ) : (
                            <EmptyState variant="today" />
                        )}
                    </PageContent>
                </ScrollAreaWrapper>
            )}

            {!shell.isWide && selectedTaskId && (
                <ResponsiveOverlayPanel
                    ariaLabel="Today details"
                    open={mobilePanelOpen}
                    onClose={() => setMobilePanelOpen(false)}
                    mode={mobileDetailMode}
                >
                    <TaskEditPanel
                        key={`today-mobile-edit-${selectedTaskId}`}
                        taskId={selectedTaskId}
                        detailMode={mobileDetailMode}
                        onDetailModeChange={setMobileDetailMode}
                        onClose={() => {
                            setSelectedTaskId(null);
                            setMobilePanelOpen(false);
                        }}
                    />
                </ResponsiveOverlayPanel>
            )}
        </MainLayout>
    );
}
