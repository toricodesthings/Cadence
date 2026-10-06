import { StartupSuspense as Suspense } from "../components/shared/StartupSuspense";
import { useTaskDetailsRequest } from "../hooks/ui/use-task-details-request";
import { useEffect, useMemo, useState, lazy } from "react";
import { useNavigate } from "react-router";
import { DayEventRows } from "../components/events/DayEventRows";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { EyeOff, Eye, Inbox, PanelRightClose, Sunrise, Repeat, CalendarClock } from "lucide-react";
import { MainLayout } from "../components/layout/MainLayout";
import { Tip } from "../components/primitives";
import { RoutineAgendaList, routineAgendaItems } from "../components/shared/RoutineAgendaRow";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { BucketedCollectionView } from "../components/shared/BucketedCollectionView";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { DaySpine, SpineSummary, SpineTimeline, type SpineItem } from "../components/today/DaySpine";
import { TaskList } from "../components/tasks/TaskList";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { PageContent } from "../components/layout/PageLayout";
import { ViewToggle } from "../components/shared/ViewToggle";
import { SortMenu } from "../components/shared/SortMenu";
import { ControlsSheet } from "../components/shared/ControlsSheet";
import { SORT_MODE_OPTIONS, SortOptionList } from "../components/shared/SortOptionList";
import { useTasks } from "../hooks/tasks/use-tasks";
import { useHabitsRange } from "../hooks/habits/use-habits";
import { useResolveHabit } from "../hooks/habits/use-resolve-habit";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteViewMode } from "../hooks/ui/use-route-view-mode";
import { useSortMode } from "../hooks/ui/use-sort-mode";
import { useRouteFocus, buildFocusSearchParams } from "../hooks/search/use-route-focus";
import { useKeyboardShortcuts } from "../hooks/core/use-keyboard-shortcuts";
import { useSectionNav } from "../hooks/ui/use-section-nav";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { ActiveFilterBar } from "../components/shared/ActiveFilterBar";
import { useFocusViewStore } from "../stores/focus-view-store";
import { atLocal, wallTimeOf } from "@cadence/domain/time";
import { dayOfInstant, nlpClock } from "../lib/utils/date-format";
import { getUserZone, useToday } from "../lib/utils/user-zone";
import { getPassiveTimetableOccurrenceAnchor, getTaskTimelineAnchor, isPassiveTimetableTask } from "../lib/utils/task/task-scheduling";
import { sortTasks } from "../lib/utils/task/sort-tasks";
import { getMaterialRankingLabel } from "../lib/utils/ranking-reasons";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";
import { rankTasks } from "@cadence/nlp/ranking";
import type { RankableTask } from "@cadence/nlp/ranking";
const LazyFocusViewBar = lazy(() => import("../components/focus-views/FocusViewBar").then(m => ({ default: m.FocusViewBar })));
import { useSettings } from "../hooks/core/use-settings";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import type { Task } from "@cadence/contracts/task";

const ROUTINES_STORAGE_KEY = "cadence-today-hide-routines";
const FIXED_STORAGE_KEY = "cadence-today-hide-fixed-column";

function readFlag(key: string) {
    try {
        return window.localStorage.getItem(key) === "1";
    } catch {
        return false;
    }
}

function writeFlag(key: string, value: boolean) {
    try {
        window.localStorage.setItem(key, value ? "1" : "0");
    } catch {
        // Per-viewer convenience only.
    }
}

/** Show/hide for a section: a quiet moonlit eye on the header's line, 44px hit area around a 16px glyph. */
function EyeToggle({ hidden, label, onToggle }: { hidden: boolean; label: string; onToggle: () => void }) {
    return (
        <Tip label={label} side="bottom">
            <button
                type="button"
                onClick={onToggle}
                aria-label={label}
                aria-pressed={hidden}
                className="touch-target -my-3 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-moonlit transition-colors hover:bg-moonlit/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                {hidden ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
            </button>
        </Tip>
    );
}

export default function TodayRoute() {
    const shell = useShellMode();
    const navigate = useNavigate();
    const { view, setView } = useRouteViewMode("today");
    const { sortMode, setSortMode } = useSortMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");

    useTaskDetailsRequest((taskId) => {
        setSelectedTaskId(taskId);
        setMobileDetailMode("peek");
        setMobilePanelOpen(true);
    });

    const [hideRoutines, setHideRoutines] = useState(false);
    const [hideFixed, setHideFixed] = useState(false);
    const resolveHabit = useResolveHabit();
    const todayISO = useToday();
    const { activeTagId } = useTagFilterStore();
    const { activeDefinition } = useFocusViewStore();
    const { data: userSettings } = useSettings();
    const smartSortEnabled = userSettings?.tasks?.intelligence?.smartSortEnabled !== false;
    const intelligenceEnabled = userSettings?.tasks?.intelligence?.nlpEnabled !== false;
    const focusViewsEnabled = userSettings?.tasks?.intelligence?.focusViewsEnabled !== false;

    const personalEvents = usePersonalEvents(Number(todayISO.slice(0, 4)));
    const todayEvents = personalEvents.enabled ? personalEvents.getEventsForDate(todayISO) : [];
    const todayDayEvents = todayEvents.map((evt) => ({ ...evt, dateStr: todayISO }));

    useDocumentMeta(
        "Today · Cadence",
        "Where you need to be, what's still open, and the routines you're keeping up today.",
    );

    useRouteFocus();

    const { onNextSection, onPrevSection } = useSectionNav();
    useKeyboardShortcuts({ onNextSection, onPrevSection });

    useEffect(() => {
        setHideRoutines(readFlag(ROUTINES_STORAGE_KEY));
        setHideFixed(readFlag(FIXED_STORAGE_KEY));
    }, []);

    const { data: tasks = [], isLoading } = useTasks({
        state: "ACTIVE",
        effectiveOnOrBeforeDate: todayISO,
    });
    // Routines are today-only: a missed one lets go and never shows here again.
    const { data: habits = [] } = useHabitsRange({
        start: todayISO,
        end: todayISO,
        enabled: !activeTagId,
    });

    const filteredTasks = useMemo(() => {
        let result = activeTagId ? tasks.filter((task) => task.tagIds?.includes(activeTagId)) : tasks;
        if (activeDefinition && intelligenceEnabled && focusViewsEnabled) {
            result = applyFocusView(result, activeDefinition, { clock: nlpClock(), dayOf: dayOfInstant });
        }
        return result;
    }, [activeTagId, tasks, activeDefinition, intelligenceEnabled, focusViewsEnabled, todayISO]);

    const grouped = useMemo(() => {
        const stillOpen: Task[] = [];
        const today: Task[] = [];
        const fixed: Task[] = [];

        for (const task of filteredTasks) {
            const anchor = getTaskTimelineAnchor(task);
            if (!anchor) continue;
            if (isPassiveTimetableTask(task)) {
                if (anchor === todayISO) fixed.push(task);
                continue;
            }
            if (anchor < todayISO) stillOpen.push(task);
            if (anchor === todayISO) today.push(task);
        }

        const routines = routineAgendaItems(activeTagId ? [] : habits, todayISO);

        const useRanking = intelligenceEnabled && smartSortEnabled && sortMode === "smart";
        const rationaleByTaskId: Record<string, string | null> = {};

        const sortBucket = (bucket: Task[]): Task[] => {
            if (!useRanking) return sortTasks(bucket, sortMode);
            const rankable: RankableTask[] = bucket.map((t) => ({
                id: t.id,
                priority: t.priority,
                isPinned: t.isPinned,
                orderIndex: t.orderIndex,
                state: t.state,
                dueDate: t.dueDate,
                scheduledStart: t.scheduledStart,
                scheduledEnd: t.scheduledEnd,
                effort: t.effort,
                waitingOn: t.waitingOn ?? null,
                notBefore: t.notBefore ?? null,
                durationEstimate: t.durationEstimate,
            }));
            const ranked = rankTasks(rankable, { routeContext: "today", clock: nlpClock(), dayOf: dayOfInstant });
            for (const item of ranked) {
                rationaleByTaskId[item.task.id] = getMaterialRankingLabel(item.reasons);
            }
            const idOrder = new Map(ranked.map((r, i) => [r.task.id, i]));
            return [...bucket].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
        };

        return {
            stillOpen: sortBucket(stillOpen),
            today: sortBucket(today),
            fixed,
            routinesOpen: routines.filter((routine) => !routine.done),
            routinesDone: routines.filter((routine) => routine.done),
            rationaleByTaskId,
        };
    }, [activeTagId, filteredTasks, habits, todayISO, sortMode, intelligenceEnabled, smartSortEnabled]);

    const spineItems = useMemo<SpineItem[]>(() => {
        const items: SpineItem[] = [];
        for (const task of grouped.fixed) {
            const occurrence = getPassiveTimetableOccurrenceAnchor(task, todayISO);
            if (!occurrence || !task.scheduledStart) continue;
            // The block's local time on today's occurrence, in the zone it was planned in.
            const zone = task.zone ?? getUserZone();
            const start = new Date(atLocal(occurrence, wallTimeOf(task.scheduledStart, zone), zone));
            const durationMs = task.scheduledEnd ? Date.parse(task.scheduledEnd) - Date.parse(task.scheduledStart) : 0;
            items.push({ id: task.id, title: task.title, start, end: durationMs > 0 ? new Date(start.getTime() + durationMs) : null });
        }
        return items;
    }, [grouped, todayISO]);

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId((current) => (current === taskId ? null : taskId));
        if (!shell.isWide) {
            setMobileDetailMode("peek");
            setMobilePanelOpen(true);
        }
    };

    const toggleRoutines = () => {
        setHideRoutines((current) => {
            writeFlag(ROUTINES_STORAGE_KEY, !current);
            return !current;
        });
    };

    const toggleFixed = () => {
        setHideFixed((current) => {
            writeFlag(FIXED_STORAGE_KEY, !current);
            return !current;
        });
    };

    const openRoutine = (habitId: string) => {
        navigate(`/routines?${buildFocusSearchParams({ focusKind: "habit", focusId: habitId })}`);
    };

    const openSpineItem = (item: SpineItem) => handleSelectTask(item.id);

    const routinesCount = grouped.routinesOpen.length + grouped.routinesDone.length;

    const sidePanel = (
        <EditSidePanelRail ariaLabel="Resize today sidebar">
            {shell.isWide && selectedTaskId ? (
                <EditSidePanel kind="task" taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
            ) : null}
        </EditSidePanelRail>
    );

    const headerRight = shell.isCompact ? (
        <div className="flex items-center gap-2">
            <Suspense fallback={null}><LazyFocusViewBar /></Suspense>
            <ControlsSheet
            routeKey="today"
            title="Today controls"
            sections={[
                {
                    id: "view",
                    label: "View",
                    content: <ViewToggle view={view} onViewChange={setView} compact />,
                },
                {
                    id: "sort",
                    label: "Sort",
                    display: "drill" as const,
                    summary: SORT_MODE_OPTIONS.find((option) => option.value === sortMode)?.label,
                    content: <SortOptionList mode={sortMode} onModeChange={setSortMode} />,
                },
                ...(selectedTaskId ? [{
                    id: "details",
                    label: "Details",
                    content: (
                        <button
                            type="button"
                            onClick={() => setMobilePanelOpen(true)}
                            className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-twilight-border/40 bg-white/[0.03] px-4 text-sm font-medium text-twilight-text-soft"
                        >
                            <PanelRightClose size={16} aria-hidden="true" />
                            Open task details
                        </button>
                    ),
                }] : []),
            ]}
        />
        </div>
    ) : (
        <div className="flex items-center gap-2">
            <ActiveFilterBar placement="header" />
            <Suspense fallback={null}><LazyFocusViewBar /></Suspense>
            <SortMenu mode={sortMode} onModeChange={setSortMode} view={view} onViewChange={setView} />
            {!shell.isWide && selectedTaskId ? (
                <button
                    type="button"
                    onClick={() => setMobilePanelOpen(true)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-twilight-border px-4 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
                    aria-label="Open task details"
                >
                    <PanelRightClose size={16} aria-hidden="true" />
                    Details
                </button>
            ) : null}
        </div>
    );

    const routinesHidden = !shell.isCompact && hideRoutines;
    const totalVisible =
        grouped.stillOpen.length +
        grouped.today.length +
        grouped.fixed.length +
        (routinesHidden ? 0 : routinesCount);

    const renderTaskBucket = (tasks: Task[], cardVariant?: "list" | "board", emptyLabel?: string) => {
        if (tasks.length > 0) {
            return (
                <TaskList
                    tasks={tasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={handleSelectTask}
                    rationaleByTaskId={grouped.rationaleByTaskId}
                    reorderable={false}
                    {...(cardVariant ? { cardVariant } : {})}
                />
            );
        }

        return (
            <div className="px-6 py-3 text-[13px] italic text-twilight-text-muted/90">
                {emptyLabel}
            </div>
        );
    };

    const renderRoutines = () => {
        return (
            <RoutineAgendaList
                items={[...grouped.routinesOpen, ...grouped.routinesDone]}
                day={todayISO}
                onOpen={openRoutine}
                onComplete={(item) => resolveHabit.mutateAsync({ habitId: item.habitId, targetDate: todayISO, status: item.done ? "PENDING" : "COMPLETED" })}
            />
        );
    };

    const routinesToggleLabel = hideRoutines ? `Show ${routinesCount} routines` : "Hide routines";
    const routinesToggle = shell.isCompact ? undefined : (
        <EyeToggle hidden={hideRoutines} label={routinesToggleLabel} onToggle={toggleRoutines} />
    );

    const sections = [
        // Board view: Fixed blocks are the first column, a vertical timeline (list view keeps the strip above).
        ...(view === "kanban" && spineItems.length > 0 ? [{
            key: "fixed",
            title: "Fixed",
            icon: CalendarClock,
            accentClass: "text-moonlit",
            count: spineItems.length,
            boardDescription: <SpineSummary items={spineItems} />,
            boardHeaderAction: shell.isCompact ? undefined : <EyeToggle hidden={false} label="Hide Fixed" onToggle={toggleFixed} />,
            boardCollapsed: !shell.isCompact && hideFixed,
            onBoardExpand: toggleFixed,
            listContent: null,
            boardContent: <SpineTimeline items={spineItems} onOpen={openSpineItem} />,
        }] : []),
        ...(grouped.stillOpen.length > 0 ? [{
            key: "still-open",
            title: "Still open",
            icon: Inbox,
            accentClass: "text-twilight-text-soft",
            count: grouped.stillOpen.length,
            listContent: renderTaskBucket(grouped.stillOpen),
            boardContent: renderTaskBucket(grouped.stillOpen, "board"),
        }] : []),
        {
            key: "today",
            title: "Today",
            icon: Sunrise,
            accentClass: "text-accent-primary",
            count: grouped.today.length,
            description: todayEvents.length > 0 ? <DayEventRows events={todayDayEvents} /> : undefined,
            listContent: renderTaskBucket(grouped.today, undefined, "Nothing planned for today yet."),
            boardContent: (
                <>
                    <DayEventRows events={todayDayEvents} className="mb-2.5" />
                    {renderTaskBucket(grouped.today, "board", "Nothing planned for today yet.")}
                </>
            ),
        },
        ...(routinesCount > 0 ? [{
            key: "routines",
            title: "Routines",
            icon: Repeat,
            accentClass: "text-moonlit",
            count: routinesHidden ? routinesCount : grouped.routinesOpen.length,
            headerAction: routinesToggle,
            lineTint: "var(--color-moonlit)",
            listOpen: !routinesHidden,
            boardCollapsed: routinesHidden,
            onBoardExpand: toggleRoutines,
            listContent: renderRoutines(),
            boardContent: renderRoutines(),
        }] : []),
    ];

    const spine = spineItems.length > 0 ? <DaySpine items={spineItems} onOpen={openSpineItem} /> : null;

    return (
        <MainLayout
            requireAuth
            sidePanel={sidePanel}
            sidePanelActive={Boolean(selectedTaskId)}
            onCloseSidePanel={() => setSelectedTaskId(null)}
            sidePanelLabel="Task"
            headerRight={headerRight}
            compactHeaderRightInline
            shellHeader={{
                title: "Today",
                eyebrow: "Focus",
                icon: <Sunrise size={18} aria-hidden="true" />,
                accentColor: "var(--accent-nav-today, var(--accent-primary))",
            }}
        >
            <PageContent width="default" className="shrink-0 pb-0 empty:hidden">
                <ActiveFilterBar placement="body" />
                {!isLoading && totalVisible === 0 ? <DayEventRows events={todayDayEvents} className="pb-2" /> : null}
            </PageContent>
            {view === "kanban" ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {isLoading ? (
                        <PageContent width="default">
                            <TaskListSkeleton />
                        </PageContent>
                    ) : totalVisible > 0 ? (
                        <BucketedCollectionView
                            view={view}
                            sections={sections}
                            desktopColumnScroll
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
                            <>
                                {spine}
                                <BucketedCollectionView
                                    view={view}
                                    sections={sections}
                                    desktopColumnScroll
                                />
                            </>
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
                    <EditSidePanel kind="task"
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
