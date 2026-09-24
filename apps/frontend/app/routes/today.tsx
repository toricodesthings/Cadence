import { StartupSuspense as Suspense } from "../components/shared/StartupSuspense";
import { useTaskDetailsRequest } from "../hooks/ui/use-task-details-request";
import { useEffect, useMemo, useState, lazy } from "react";
import { useNavigate } from "react-router";
import { DayEventRows } from "../components/events/DayEventRows";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { ChevronDown, EyeOff, Eye, Inbox, PanelRightClose, Sunrise, Repeat } from "lucide-react";
import { MainLayout } from "../components/layout/MainLayout";
import { Tip } from "../components/primitives";
import { RoutineAgendaRow } from "../components/shared/RoutineAgendaRow";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { BucketedCollectionView } from "../components/shared/BucketedCollectionView";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { DaySpine, type SpineItem } from "../components/today/DaySpine";
import { TaskList } from "../components/tasks/TaskList";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { PageContent } from "../components/layout/PageLayout";
import { ViewToggle } from "../components/shared/ViewToggle";
import { SortMenu } from "../components/shared/SortMenu";
import { ControlsSheet } from "../components/shared/ControlsSheet";
import { SORT_MODE_OPTIONS, SortOptionList } from "../components/shared/SortOptionList";
import { useTasks } from "../hooks/tasks/use-tasks";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
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
import { formatTime, toISODate } from "../lib/utils/date-format";
import { getPassiveTimetableOccurrenceAnchor, getTaskTimelineAnchor, isPassiveTimetableTask, toTaskDateOnly } from "../lib/utils/task/task-scheduling";
import { sortTasks } from "../lib/utils/task/sort-tasks";
import { getMaterialRankingLabel } from "../lib/utils/ranking-reasons";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";
import { rankTasks } from "@cadence/nlp/ranking";
import type { RankableTask } from "@cadence/nlp/ranking";
import { routineTimeOn } from "@cadence/domain/repeats";
const LazyFocusViewBar = lazy(() => import("../components/focus-views/FocusViewBar").then(m => ({ default: m.FocusViewBar })));
import { useSettings } from "../hooks/core/use-settings";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import type { Task } from "@cadence/contracts/task";

const ROUTINES_STORAGE_KEY = "cadence-today-hide-routines";

interface TodayRoutine {
    id: string;
    habitId: string;
    title: string;
    emoji: string | null;
    /** "HH:mm" for today, when the routine has one. */
    time: string | null;
    done: boolean;
}

function TodayRoutineRow({ item, onOpen }: { item: TodayRoutine; onOpen: () => void }) {
    const resolveHabit = useResolveHabit(item.habitId);
    const todayISO = toISODate(new Date());

    return (
        <RoutineAgendaRow
            title={item.title}
            emoji={item.emoji}
            done={item.done}
            timeLabel={item.time ? formatTime(`${todayISO}T${item.time}:00`) : null}
            onOpen={onOpen}
            onComplete={() => resolveHabit.mutateAsync({ targetDate: todayISO, status: item.done ? "PENDING" : "COMPLETED" })}
        />
    );
}

function readHideRoutines() {
    try {
        return window.localStorage.getItem(ROUTINES_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export default function TodayRoute() {
    const shell = useShellMode();
    const navigate = useNavigate();
    const { view, setView } = useRouteViewMode("today");
    const { sortMode, setSortMode } = useSortMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const [showDoneRoutines, setShowDoneRoutines] = useState(false);

    useTaskDetailsRequest((taskId) => {
        setSelectedTaskId(taskId);
        setMobileDetailMode("peek");
        setMobilePanelOpen(true);
    });

    const [hideRoutines, setHideRoutines] = useState(false);
    const todayISO = toISODate(new Date());
    const { activeTagId } = useTagFilterStore();
    const { activeDefinition } = useFocusViewStore();
    const { data: userSettings } = useSettings();
    const smartSortEnabled = userSettings?.tasks?.intelligence?.smartSortEnabled !== false;
    const intelligenceEnabled = userSettings?.tasks?.intelligence?.nlpEnabled !== false;
    const focusViewsEnabled = userSettings?.tasks?.intelligence?.focusViewsEnabled !== false;
    const lowStimulationMode = userSettings?.tasks?.intelligence?.lowStimulationMode ?? false;

    const todayDate = new Date();
    const personalEvents = usePersonalEvents(todayDate.getFullYear());
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
        setHideRoutines(readHideRoutines());
    }, []);

    const { data: tasks = [], isLoading } = useTasks({
        state: "ACTIVE",
        effectiveOnOrBeforeDate: todayISO,
    });
    // Routines are today-only: a missed one lets go and never shows here again.
    const { data: habits = [] } = useHabitsWeekly({
        start: todayISO,
        end: todayISO,
        enabled: !activeTagId,
    });

    const filteredTasks = useMemo(() => {
        let result = activeTagId ? tasks.filter((task) => task.tagIds?.includes(activeTagId)) : tasks;
        if (activeDefinition && intelligenceEnabled && focusViewsEnabled) {
            result = applyFocusView(result, activeDefinition);
        }
        return result;
    }, [activeTagId, tasks, activeDefinition, intelligenceEnabled, focusViewsEnabled]);

    const grouped = useMemo(() => {
        const stillOpen: Task[] = [];
        const today: Task[] = [];
        const fixed: Task[] = [];
        const routines: TodayRoutine[] = [];

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

        for (const habit of activeTagId ? [] : habits) {
            const log = habit.logs?.find((entry) => toTaskDateOnly(entry.targetDate) === todayISO);
            if (!log || log.status === "SKIPPED") continue;
            routines.push({
                id: `habit-${habit.id}-${todayISO}`,
                habitId: habit.id,
                title: habit.title,
                emoji: habit.emoji ?? null,
                time: routineTimeOn(habit, todayISO),
                done: log.status === "COMPLETED",
            });
        }

        routines.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title));

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
                isAllDay: t.isAllDay,
                effort: t.effort,
                waitingOn: t.waitingOn ?? null,
                notBefore: t.notBefore ?? null,
                durationEstimate: t.durationEstimate,
            }));
            const ranked = rankTasks(rankable, { routeContext: "today", lowStimulation: lowStimulationMode });
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
    }, [activeTagId, filteredTasks, habits, todayISO, sortMode, intelligenceEnabled, smartSortEnabled, lowStimulationMode]);

    const spineItems = useMemo<SpineItem[]>(() => {
        const items: SpineItem[] = [];
        for (const task of grouped.fixed) {
            const occurrence = getPassiveTimetableOccurrenceAnchor(task, new Date());
            if (!occurrence || !task.scheduledStart) continue;
            const start = new Date(occurrence);
            const durationMs = task.scheduledEnd ? new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime() : 0;
            items.push({ id: task.id, kind: "fixed", title: task.title, start, end: durationMs > 0 ? new Date(start.getTime() + durationMs) : null });
        }
        for (const routine of [...grouped.routinesOpen, ...grouped.routinesDone]) {
            if (!routine.time) continue;
            items.push({
                id: routine.id,
                kind: "routine",
                title: routine.title,
                emoji: routine.emoji,
                start: new Date(`${todayISO}T${routine.time}:00`),
                end: null,
                done: routine.done,
            });
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
            const next = !current;
            try {
                window.localStorage.setItem(ROUTINES_STORAGE_KEY, next ? "1" : "0");
            } catch {
                // Per-viewer convenience only.
            }
            return next;
        });
    };

    const openRoutine = (habitId: string) => {
        navigate(`/routines?${buildFocusSearchParams({ focusKind: "habit", focusId: habitId })}`);
    };

    const openSpineItem = (item: SpineItem) => {
        if (item.kind === "fixed") {
            handleSelectTask(item.id);
            return;
        }
        const routine = [...grouped.routinesOpen, ...grouped.routinesDone].find((entry) => entry.id === item.id);
        if (routine) openRoutine(routine.habitId);
    };

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
        if (routinesHidden) {
            return (
                <div className="px-6 py-3 text-[13px] italic text-twilight-text-muted/90">
                    Routines hidden ({routinesCount}).
                </div>
            );
        }

        const doneCount = grouped.routinesDone.length;

        return (
            <div className="flex flex-col">
                {grouped.routinesOpen.length === 0 ? (
                    <div className="px-6 py-3 text-[13px] italic text-twilight-text-muted/90">
                        All done for today.
                    </div>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {grouped.routinesOpen.map((item) => (
                            <TodayRoutineRow key={item.id} item={item} onOpen={() => openRoutine(item.habitId)} />
                        ))}
                    </div>
                )}
                {doneCount > 0 ? (
                    <>
                        <button
                            type="button"
                            onClick={() => setShowDoneRoutines((value) => !value)}
                            aria-expanded={showDoneRoutines}
                            className="mx-2 mt-1 inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-2xl px-3 text-[13px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${showDoneRoutines ? "rotate-180" : ""}`} />
                            {doneCount} done
                        </button>
                        {showDoneRoutines ? (
                            <div className="flex flex-col gap-0.5">
                                {grouped.routinesDone.map((item) => (
                                    <TodayRoutineRow key={item.id} item={item} onOpen={() => openRoutine(item.habitId)} />
                                ))}
                            </div>
                        ) : null}
                    </>
                ) : null}
            </div>
        );
    };

    const routinesToggleLabel = hideRoutines ? `Show routines (${routinesCount})` : "Hide routines";

    const sections = [
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
            headerAction: !shell.isCompact && (
                <button
                    type="button"
                    onClick={toggleRoutines}
                    className="touch-target inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-moonlit/20 bg-moonlit/10 px-4 text-xs font-medium uppercase tracking-[0.14em] text-moonlit"
                    aria-pressed={hideRoutines}
                >
                    {hideRoutines ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                    {hideRoutines ? `Show (${routinesCount})` : "Hide"}
                </button>
            ),
            boardHeaderAction: !shell.isCompact && (
                <Tip label={routinesToggleLabel} side="bottom">
                    <button
                        type="button"
                        onClick={toggleRoutines}
                        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-moonlit/20 bg-moonlit/10 text-moonlit transition-colors hover:bg-moonlit/14"
                        aria-label={routinesToggleLabel}
                    >
                        {hideRoutines ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                    </button>
                </Tip>
            ),
            listSectionClassName: "rounded-[28px] border border-moonlit/15 bg-moonlit/[0.05] px-4 py-4",
            boardSectionClassName: "border-moonlit/20 bg-moonlit/[0.05]",
            boardCollapsed: routinesHidden,
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
            <PageContent width="default" className="shrink-0 empty:hidden">
                <ActiveFilterBar placement="body" />
                {!isLoading && totalVisible === 0 ? <DayEventRows events={todayDayEvents} className="pb-2" /> : null}
                {view === "kanban" ? spine : null}
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
