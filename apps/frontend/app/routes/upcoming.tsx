import { StartupSuspense as Suspense } from "../components/shared/StartupSuspense";
import { useTaskDetailsRequest } from "../hooks/ui/use-task-details-request";
import { useEffect, useMemo, useState, lazy } from "react";
import { useNavigate } from "react-router";
import { DayEventRows, type DayEvent } from "../components/events/DayEventRows";
import {
    Inbox,
    CalendarRange,
    ChevronDown,
    Layers3,
    PanelRightClose,
    Sunrise,
    Telescope,
} from "lucide-react";
import { MainLayout } from "../components/layout/MainLayout";
import { AgendaHabitDivider } from "../components/shared/AgendaRow";
import { RoutineAgendaRow } from "../components/shared/RoutineAgendaRow";
import { BucketedCollectionView } from "../components/shared/BucketedCollectionView";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { TaskList } from "../components/tasks/TaskList";
import { PageContent } from "../components/layout/PageLayout";
import { ViewToggle } from "../components/shared/ViewToggle";
import { SortMenu } from "../components/shared/SortMenu";
import { ControlsSheet } from "../components/shared/ControlsSheet";
import { SORT_MODE_OPTIONS, SortOptionList } from "../components/shared/SortOptionList";
import { useTasks } from "../hooks/tasks/use-tasks";
import { useProjects } from "../hooks/projects/use-projects";
import { useHabitsRange } from "../hooks/habits/use-habits";
import { useResolveHabit } from "../hooks/habits/use-resolve-habit";
import { nextOpenTime, routineTimeOn, timeMarksOn } from "@cadence/domain/repeats";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { ActiveFilterBar } from "../components/shared/ActiveFilterBar";
import { useFocusViewStore } from "../stores/focus-view-store";
import { useRouteViewMode } from "../hooks/ui/use-route-view-mode";
import { useSortMode } from "../hooks/ui/use-sort-mode";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useDeviceFlag } from "../hooks/ui/use-device-flag";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { useKeyboardShortcuts } from "../hooks/core/use-keyboard-shortcuts";
import { useSectionNav } from "../hooks/ui/use-section-nav";
import { useSettings } from "../hooks/core/use-settings";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import { addDays, wallTimeOf, type LocalDate } from "@cadence/domain/time";
import { dayOfInstant, formatShortDate, formatShortDateLabel, formatTime, formatWallTime, fromTimeValue, nlpClock } from "../lib/utils/date-format";
import { getUserZone, useToday } from "../lib/utils/user-zone";
import { getTaskTimelineAnchor, isPassiveTimetableTask } from "../lib/utils/task/task-scheduling";
import { getMaterialRankingLabel } from "../lib/utils/ranking-reasons";
import { groupFurtherOut } from "../lib/utils/task/horizon";
import type { SortMode } from "../lib/utils/task/sort-tasks";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";
import { rankTasks } from "@cadence/nlp/ranking";
import type { RankableTask } from "@cadence/nlp/ranking";
import type { Task } from "@cadence/contracts/task";

const LazyFocusViewBar = lazy(() => import("../components/focus-views/FocusViewBar").then((m) => ({ default: m.FocusViewBar })));

type UpcomingBucketKey = "overdue" | "today" | "tomorrow" | "nextWeek" | "further";

const FURTHER_OPEN_STORAGE_KEY = "cadence-upcoming-further-open";

interface UpcomingViewerItem {
    id: string;
    kind: "task" | "habit";
    title: string;
    dueDate: LocalDate;
    dateLabel: "Due" | "Scheduled";
    /** Epoch ms: when it sits in the day (all-day items at noon). */
    sortAt: number;
    timeLabel: string | null;
    projectId: string | null;
    projectName: string | null;
    projectColor: string | null;
    projectEmoji: string | null;
    task: Task | null;
    habitId?: string;
    habitTargetDate?: string;
    emoji?: string | null;
    rationaleLabel: string | null;
}

const UPCOMING_SECTIONS: Array<{
    key: UpcomingBucketKey;
    title: string;
    icon: typeof Inbox;
    accentClass: string;
}> = [
    {
        key: "overdue",
        title: "Still open",
        icon: Inbox,
        accentClass: "text-twilight-text-soft",
    },
    {
        key: "today",
        title: "Today",
        icon: Sunrise,
        accentClass: "text-accent-primary",
    },
    {
        key: "tomorrow",
        title: "Tomorrow",
        icon: CalendarRange,
        accentClass: "text-moonlit",
    },
    {
        key: "nextWeek",
        title: "Next 7 Days",
        icon: Layers3,
        accentClass: "text-moonlit",
    },
    {
        key: "further",
        title: "Further out",
        icon: Telescope,
        accentClass: "text-twilight-text-soft",
    },
];

const emptyBuckets = <T,>(): Record<UpcomingBucketKey, T[]> => ({ overdue: [], today: [], tomorrow: [], nextWeek: [], further: [] });

function getTaskSortAt(task: Task, day: LocalDate) {
    return Date.parse(task.scheduledStart ?? fromTimeValue(day, "12:00"));
}

function getUpcomingComparator(mode: SortMode) {
    return (a: UpcomingViewerItem, b: UpcomingViewerItem): number => {
        switch (mode) {
            case "priority": {
                const pa = a.task?.priority ?? 0;
                const pb = b.task?.priority ?? 0;
                if (pa !== pb) return pb - pa;
                if (a.sortAt !== b.sortAt) return a.sortAt - b.sortAt;
                return a.title.localeCompare(b.title);
            }
            case "manual": {
                const oa = a.task?.orderIndex ?? 0;
                const ob = b.task?.orderIndex ?? 0;
                return oa - ob;
            }
            default: {
                if (a.sortAt !== b.sortAt) return a.sortAt - b.sortAt;
                return a.title.localeCompare(b.title);
            }
        }
    };
}

function classifyUpcomingBucket(dateOnly: LocalDate, todayISO: LocalDate, tomorrowISO: LocalDate, nextWeekISO: LocalDate): UpcomingBucketKey {
    if (dateOnly < todayISO) return "overdue";
    if (dateOnly === todayISO) return "today";
    if (dateOnly === tomorrowISO) return "tomorrow";
    return dateOnly <= nextWeekISO ? "nextWeek" : "further";
}

function UpcomingEmptyState({ title }: { title: string }) {
    return (
        <div className="px-6 py-3 text-[13px] italic text-twilight-text-muted/65">
            Nothing in {title.toLowerCase()}.
        </div>
    );
}

export default function Upcoming() {
    const { data: tasks = [], isLoading: tasksLoading } = useTasks({ state: "ACTIVE" });
    const { data: projects = [] } = useProjects();
    const { activeTagId } = useTagFilterStore();
    const { activeDefinition } = useFocusViewStore();
    const navigate = useNavigate();
    const { view, setView } = useRouteViewMode("upcoming");
    const { sortMode, setSortMode } = useSortMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");

    useTaskDetailsRequest((taskId) => {
        setSelectedTaskId(taskId);
        setMobileDetailMode("peek");
        setMobilePanelOpen(true);
    });

    const { mutate: resolveHabit } = useResolveHabit();
    const shell = useShellMode();
    const { data: userSettings } = useSettings();
    const smartSortEnabled = userSettings?.tasks?.intelligence?.smartSortEnabled !== false;
    const intelligenceEnabled = userSettings?.tasks?.intelligence?.nlpEnabled !== false;
    const focusViewsEnabled = userSettings?.tasks?.intelligence?.focusViewsEnabled !== false;

    const todayISO = useToday();
    const tomorrowISO = addDays(todayISO, 1);
    const nextWeekISO = addDays(todayISO, 7);
    const habitsRangeStart = addDays(todayISO, -30);

    const personalEvents = usePersonalEvents(Number(todayISO.slice(0, 4)));
    const upcomingEvents = useMemo(() => {
        if (!personalEvents.enabled) return [];
        const events: Array<{ event: import("../types/settings").PersonalEvent; dateStr: string }> = [];
        for (let i = 0; i <= 7; i++) {
            const ds = addDays(todayISO, i);
            for (const evt of personalEvents.getEventsForDate(ds)) {
                events.push({ event: evt, dateStr: ds });
            }
        }
        return events;
    }, [personalEvents, todayISO]);

    const { data: habits = [], isLoading: habitsLoading } = useHabitsRange({
        start: habitsRangeStart,
        end: nextWeekISO,
    });

    const { focusParams } = useRouteFocus();

    const { onNextSection, onPrevSection } = useSectionNav();
    useKeyboardShortcuts({ onNextSection, onPrevSection });

    const tagFilteredTasks = useMemo(() => {
        let next = activeTagId
            ? tasks.filter((task) => task.tagIds?.includes(activeTagId))
            : tasks;

        if (activeDefinition && intelligenceEnabled && focusViewsEnabled) {
            next = applyFocusView(next, activeDefinition, { clock: nlpClock(), dayOf: dayOfInstant });
        }

        return next;
    }, [activeDefinition, activeTagId, focusViewsEnabled, intelligenceEnabled, tasks, todayISO]);

    const projectById = useMemo(
        () => new Map(projects.map((project) => [project.id, project] as const)),
        [projects],
    );

    const groupedItems = useMemo<Record<UpcomingBucketKey, UpcomingViewerItem[]>>(() => {
        const grouped = emptyBuckets<UpcomingViewerItem>();

        for (const task of tagFilteredTasks) {
            if (isPassiveTimetableTask(task)) {
                continue;
            }

            const dateOnly = getTaskTimelineAnchor(task, todayISO) ?? task.dueDate;
            if (!dateOnly) continue;

            const bucket = classifyUpcomingBucket(dateOnly, todayISO, tomorrowISO, nextWeekISO);
            const project = task.projectId ? projectById.get(task.projectId) ?? null : null;

            grouped[bucket].push({
                id: task.id,
                kind: "task",
                title: task.title,
                dueDate: dateOnly,
                dateLabel: task.dueDate ? "Due" : "Scheduled",
                sortAt: getTaskSortAt(task, dateOnly),
                timeLabel: task.scheduledStart ? formatTime(task.scheduledStart) : null,
                projectId: task.projectId,
                projectName: project?.name ?? null,
                projectColor: project?.colorAccent ?? null,
                projectEmoji: project?.emoji ?? null,
                task,
                rationaleLabel: null,
            });
        }

        for (const habit of activeTagId ? [] : habits) {
            const project = null;
            const logs = [...(habit.logs ?? [])].sort((a, b) => a.targetDate.localeCompare(b.targetDate));

            for (const log of logs) {
                if (log.status !== "PENDING") continue;

                const dateOnly = log.targetDate;
                if (!dateOnly) continue;

                const bucket = classifyUpcomingBucket(dateOnly, todayISO, tomorrowISO, nextWeekISO);
                // Routines show for today and tomorrow only; a missed one lets go, never overdue.
                if (bucket !== "today" && bucket !== "tomorrow") continue;

                // A routine at set times lists at its next open time (its first on a later day).
                const times = habit.times?.length ? habit.times : null;
                const time = times
                    ? nextOpenTime(times, timeMarksOn(times, log), dateOnly === todayISO ? wallTimeOf(new Date(), getUserZone()) : "00:00")
                    : routineTimeOn(habit, dateOnly);
                const habitTimeLabel = time ? `${times ? "Next at " : ""}${formatWallTime(time)}` : null;

                grouped[bucket].push({
                    id: `habit-${habit.id}-${dateOnly}`,
                    kind: "habit",
                    title: habit.title,
                    dueDate: dateOnly,
                    dateLabel: "Due",
                    sortAt: Date.parse(fromTimeValue(dateOnly, time ?? "12:00")),
                    timeLabel: habitTimeLabel,
                    projectId: null,
                    projectName: project,
                    projectColor: null,
                    projectEmoji: null,
                    task: null,
                    habitId: habit.id,
                    habitTargetDate: log.targetDate,
                    emoji: habit.emoji,
                    rationaleLabel: null,
                });
            }
        }

        const useRanking = intelligenceEnabled && smartSortEnabled && sortMode === "smart";
        if (useRanking) {
            for (const bucket of Object.keys(grouped) as UpcomingBucketKey[]) {
                const rankable: RankableTask[] = grouped[bucket]
                    .filter((item): item is UpcomingViewerItem & { task: Task } => item.kind === "task" && Boolean(item.task))
                    .map((item) => ({
                        id: item.task!.id,
                        priority: item.task!.priority,
                        isPinned: item.task!.isPinned,
                        orderIndex: item.task!.orderIndex,
                        state: item.task!.state,
                        dueDate: item.task!.dueDate,
                        scheduledStart: item.task!.scheduledStart,
                        scheduledEnd: item.task!.scheduledEnd,
                        effort: item.task!.effort,
                        waitingOn: item.task!.waitingOn ?? null,
                        notBefore: item.task!.notBefore ?? null,
                        durationEstimate: item.task!.durationEstimate,
                    }));
                const ranked = rankTasks(rankable, { routeContext: "upcoming", clock: nlpClock(), dayOf: dayOfInstant });
                const sorted = ranked.flatMap((entry) => {
                    const item = grouped[bucket].find((candidate) => candidate.task?.id === entry.task.id);
                    if (!item) return [];
                    const reasonLabel = getMaterialRankingLabel(entry.reasons);
                    return [{ ...item, rationaleLabel: reasonLabel }];
                });

                const unranked = grouped[bucket].filter((item) => item.kind !== "task");
                grouped[bucket] = [...sorted, ...unranked];
                continue;
            }
        } else {
            const comparator = getUpcomingComparator(sortMode);
            for (const bucket of Object.keys(grouped) as UpcomingBucketKey[]) {
                grouped[bucket].sort(comparator);
            }
        }

        return grouped;
    }, [activeTagId, habits, nextWeekISO, projectById, sortMode, tagFilteredTasks, todayISO, tomorrowISO, intelligenceEnabled, smartSortEnabled]);

    const totalVisible = Object.values(groupedItems).reduce((sum, items) => sum + items.length, 0);

    // Further out stays folded to one line unless opened here, or a search/reminder tap points at a row inside it.
    const [furtherKeptOpen, toggleFurtherKeptOpen] = useDeviceFlag(FURTHER_OPEN_STORAGE_KEY);
    const [furtherRevealed, setFurtherRevealed] = useState(false);
    const focusTaskId = focusParams?.focusKind === "task" ? focusParams.focusId : undefined;
    const focusIsFurther = Boolean(focusTaskId) && groupedItems.further.some((item) => item.id === focusTaskId);
    useEffect(() => {
        if (focusIsFurther) setFurtherRevealed(true);
    }, [focusIsFurther]);
    const furtherOpen = furtherKeptOpen || furtherRevealed;
    const toggleFurther = () => {
        setFurtherRevealed(false);
        if (!furtherOpen || furtherKeptOpen) toggleFurtherKeptOpen();
    };
    const isLoading = tasksLoading || habitsLoading;

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId((current) => (current === taskId ? null : taskId));
        if (!shell.isWide) {
            setMobileDetailMode("peek");
            setMobilePanelOpen(true);
        }
    };

    const handleCompleteHabit = (item: UpcomingViewerItem) => {
        if (item.kind !== "habit" || !item.habitId || !item.habitTargetDate) return;
        resolveHabit({ habitId: item.habitId, targetDate: item.habitTargetDate, status: "COMPLETED" });
    };

    const sidePanel = (
        <EditSidePanelRail ariaLabel="Resize upcoming sidebar">
            {shell.isWide && selectedTaskId ? (
                <EditSidePanel kind="task" taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
            ) : null}
        </EditSidePanelRail>
    );

    const openHabits = () => navigate("/routines");

    // Same shape as Today: the real task cards first, then pending routines
    // under a divider, so a task reads identically on both routes.
    const renderUpcomingBucket = (
        title: string,
        bucketKey: UpcomingBucketKey,
        items: UpcomingViewerItem[],
        cardVariant?: "list" | "board",
    ) => {
        if (items.length === 0) {
            return <UpcomingEmptyState title={title} />;
        }

        const taskItems = items.filter((item) => item.kind === "task" && item.task);
        const habitItems = items.filter((item) => item.kind === "habit");
        const rationaleByTaskId = Object.fromEntries(
            taskItems.map((item) => [item.task!.id, item.rationaleLabel]),
        );

        return (
            <div className="flex flex-col gap-3">
                {taskItems.length > 0 ? (
                    <TaskList
                        tasks={taskItems.map((item) => item.task!)}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={handleSelectTask}
                        rationaleByTaskId={rationaleByTaskId}
                        reorderable={false}
                        {...(cardVariant ? { cardVariant } : {})}
                    />
                ) : null}

                {habitItems.length > 0 ? (
                    <>
                        {taskItems.length > 0 ? (
                            <AgendaHabitDivider label="Routines" />
                        ) : null}
                        <div className="flex flex-col divide-y divide-white/[0.05]">
                            {habitItems.map((item) => (
                                <RoutineAgendaRow
                                    key={item.id}
                                    title={item.title}
                                    emoji={item.emoji}
                                    dateLabel={bucketKey === "nextWeek" ? formatShortDate(item.dueDate) : null}
                                    timeLabel={item.timeLabel}
                                    onOpen={openHabits}
                                    onComplete={() => handleCompleteHabit(item)}
                                />
                            ))}
                        </div>
                    </>
                ) : null}
            </div>
        );
    };

    // Each event sits in its day's section or column.
    const dayEvents = emptyBuckets<DayEvent>();
    for (const { event, dateStr } of upcomingEvents) {
        const bucket = classifyUpcomingBucket(dateStr, todayISO, tomorrowISO, nextWeekISO);
        dayEvents[bucket].push({ ...event, dateStr, dateLabel: bucket === "nextWeek" ? formatShortDate(dateStr) : null });
    }

    // Tasks only (routines and yearly events keep to the week), grouped by week and then month.
    const renderFurtherOut = (cardVariant?: "list" | "board") => (
        <div className="flex flex-col gap-4">
            {groupFurtherOut(groupedItems.further, todayISO).map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                    <h3 className="px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-twilight-text-muted">{group.label}</h3>
                    <TaskList
                        tasks={group.items.map((item) => item.task!)}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={handleSelectTask}
                        rationaleByTaskId={Object.fromEntries(group.items.map((item) => [item.id, item.rationaleLabel]))}
                        reorderable={false}
                        {...(cardVariant ? { cardVariant } : {})}
                    />
                </div>
            ))}
        </div>
    );

    const nextFurther = groupedItems.further.reduce<UpcomingViewerItem | null>(
        (soonest, item) => (!soonest || item.dueDate < soonest.dueDate ? item : soonest),
        null,
    );
    const furtherLabel = furtherOpen ? "Fold further out" : `Show ${groupedItems.further.length} further out`;
    const furtherToggle = (
        <button
            type="button"
            onClick={toggleFurther}
            aria-expanded={furtherOpen}
            aria-label={furtherLabel}
            title={furtherLabel}
            className="touch-target -my-3 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
        >
            <ChevronDown size={16} aria-hidden="true" className={`transition-transform duration-200 ${furtherOpen ? "rotate-180" : ""}`} />
        </button>
    );
    // Folded, the section is one quiet line: the count in the header, the next thing due under it.
    const furtherSummary = !furtherOpen && nextFurther ? (
        <button type="button" onClick={toggleFurther} className="cursor-pointer text-left text-[13px] text-twilight-text-muted transition-colors hover:text-twilight-text-soft">
            Next: {nextFurther.title} · {formatShortDateLabel(nextFurther.dueDate)}
        </button>
    ) : undefined;

    const sections = UPCOMING_SECTIONS.flatMap((section) => {
        const items = groupedItems[section.key];
        if (section.key === "further") {
            if (items.length === 0) return [];
            return [{
                ...section,
                count: items.length,
                description: furtherSummary,
                headerAction: furtherToggle,
                listOpen: furtherOpen,
                listContent: renderFurtherOut(),
                // Desktop boards fold it to a rail; a phone board already shows one column at a time.
                boardCollapsed: !shell.isCompact && !furtherOpen,
                onBoardExpand: toggleFurther,
                boardHeaderAction: shell.isCompact ? undefined : furtherToggle,
                boardContent: renderFurtherOut("board"),
            }];
        }
        return [{
            ...section,
            count: items.length,
            description: dayEvents[section.key].length > 0 ? <DayEventRows events={dayEvents[section.key]} /> : undefined,
            listContent: renderUpcomingBucket(section.title, section.key, items),
            boardContent: (
                <>
                    <DayEventRows events={dayEvents[section.key]} className="mb-2.5" />
                    {renderUpcomingBucket(section.title, section.key, items, "board")}
                </>
            ),
        }];
    });

    return (
        <MainLayout
            requireAuth
            sidePanel={sidePanel}
            sidePanelActive={Boolean(selectedTaskId)}
            onCloseSidePanel={() => setSelectedTaskId(null)}
            sidePanelLabel="Task"
            compactHeaderRightInline
            headerRight={shell.isCompact ? (
                <div className="flex items-center gap-2">
                <Suspense fallback={null}><LazyFocusViewBar /></Suspense>
                <ControlsSheet
                    routeKey="upcoming"
                    title="Upcoming controls"
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
                </div>
            )}
            shellHeader={{
                title: "Upcoming",
                eyebrow: "Horizon",
                icon: <CalendarRange size={18} aria-hidden="true" />,
                accentColor: "var(--accent-nav-upcoming, var(--accent-primary))",
            }}
        >
            <PageContent width="default" className="shrink-0 empty:hidden">
                <ActiveFilterBar placement="body" />
                {!isLoading && totalVisible === 0 ? (
                    <DayEventRows
                        events={upcomingEvents.map(({ event, dateStr }) => ({ ...event, dateStr, dateLabel: formatShortDate(dateStr) }))}
                        className="pb-2"
                    />
                ) : null}
            </PageContent>
            {view === "kanban" ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {isLoading ? (
                        <PageContent width="default">
                            <TaskListSkeleton />
                        </PageContent>
                    ) : totalVisible > 0 ? (
                        <BucketedCollectionView view={view} sections={sections} desktopColumnScroll />
                    ) : (
                        <PageContent width="default">
                            <EmptyState variant="upcoming" />
                        </PageContent>
                    )}
                </div>
            ) : (
                <ScrollAreaWrapper>
                    <PageContent width="default">
                        {isLoading ? (
                            <TaskListSkeleton />
                        ) : totalVisible > 0 ? (
                            <BucketedCollectionView view={view} sections={sections} desktopColumnScroll />
                        ) : (
                            <EmptyState variant="upcoming" />
                        )}
                    </PageContent>
                </ScrollAreaWrapper>
            )}

            {!shell.isWide && selectedTaskId && (
                <ResponsiveOverlayPanel
                    ariaLabel="Upcoming details"
                    open={mobilePanelOpen}
                    onClose={() => setMobilePanelOpen(false)}
                    mode={mobileDetailMode}
                >
                    <EditSidePanel kind="task"
                        key={`upcoming-mobile-edit-${selectedTaskId}`}
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
