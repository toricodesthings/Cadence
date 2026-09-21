import { StartupSuspense as Suspense } from "../components/shared/StartupSuspense";
import { useTaskDetailsRequest } from "../hooks/ui/use-task-details-request";
import { useMemo, useState, lazy } from "react";
import { useNavigate } from "react-router";
import {
    Inbox,
    CalendarRange,
    Layers3,
    PanelRightClose,
    Sunrise,
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
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { useResolveHabit } from "../hooks/habits/use-resolve-habit";
import { routineTimeOn } from "@cadence/domain/repeats";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { ActiveFilterBar } from "../components/shared/ActiveFilterBar";
import { useFocusViewStore } from "../stores/focus-view-store";
import { useRouteViewMode } from "../hooks/ui/use-route-view-mode";
import { useSortMode } from "../hooks/ui/use-sort-mode";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { useKeyboardShortcuts } from "../hooks/core/use-keyboard-shortcuts";
import { useSectionNav } from "../hooks/ui/use-section-nav";
import { useSettings } from "../hooks/core/use-settings";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import { addDays, formatShortDate, formatTime, toISODate } from "../lib/utils/date-format";
import { getTaskTimelineAnchor, isPassiveTimetableTask, toTaskDateOnly } from "../lib/utils/task/task-scheduling";
import { getMaterialRankingLabel } from "../lib/utils/ranking-reasons";
import type { SortMode } from "../lib/utils/task/sort-tasks";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";
import { rankTasks } from "@cadence/nlp/ranking";
import type { RankableTask } from "@cadence/nlp/ranking";
import type { Task } from "@cadence/contracts/task";

const LazyFocusViewBar = lazy(() => import("../components/focus-views/FocusViewBar").then((m) => ({ default: m.FocusViewBar })));

type UpcomingBucketKey = "overdue" | "today" | "tomorrow" | "nextWeek";

interface UpcomingViewerItem {
    id: string;
    kind: "task" | "habit";
    title: string;
    dueDate: string;
    dateLabel: "Due" | "Scheduled";
    sortAt: string;
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
        title: "Next Week",
        icon: Layers3,
        accentClass: "text-moonlit",
    },
];

function toDateOnly(value: string | null | undefined) {
    return toTaskDateOnly(value);
}

function getTaskSortAt(task: Task, dateOnly: string) {
    if (task.scheduledStart) return task.scheduledStart;
    return `${dateOnly}T12:00:00`;
}

function getUpcomingComparator(mode: SortMode) {
    return (a: UpcomingViewerItem, b: UpcomingViewerItem): number => {
        switch (mode) {
            case "priority": {
                const pa = a.task?.priority ?? 0;
                const pb = b.task?.priority ?? 0;
                if (pa !== pb) return pb - pa;
                if (a.sortAt !== b.sortAt) return a.sortAt.localeCompare(b.sortAt);
                return a.title.localeCompare(b.title);
            }
            case "manual": {
                const oa = a.task?.orderIndex ?? 0;
                const ob = b.task?.orderIndex ?? 0;
                return oa - ob;
            }
            default: {
                if (a.sortAt !== b.sortAt) return a.sortAt.localeCompare(b.sortAt);
                return a.title.localeCompare(b.title);
            }
        }
    };
}

function classifyUpcomingBucket(dateOnly: string, todayISO: string, tomorrowISO: string, nextWeekISO: string): UpcomingBucketKey | null {
    if (dateOnly < todayISO) return "overdue";
    if (dateOnly === todayISO) return "today";
    if (dateOnly === tomorrowISO) return "tomorrow";
    if (dateOnly > tomorrowISO && dateOnly <= nextWeekISO) return "nextWeek";
    return null;
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
    const lowStimulationMode = userSettings?.tasks?.intelligence?.lowStimulationMode ?? false;

    const today = new Date();
    const todayISO = toISODate(today);
    const tomorrowISO = toISODate(addDays(today, 1));
    const nextWeekISO = toISODate(addDays(today, 7));
    const habitsRangeStart = toISODate(addDays(today, -30));

    const personalEvents = usePersonalEvents(today.getFullYear());
    const upcomingEvents = useMemo(() => {
        if (!personalEvents.enabled) return [];
        const events: Array<{ event: import("../types/settings").PersonalEvent; dateStr: string }> = [];
        for (let i = 0; i <= 7; i++) {
            const d = addDays(today, i);
            const ds = toISODate(d);
            for (const evt of personalEvents.getEventsForDate(ds)) {
                events.push({ event: evt, dateStr: ds });
            }
        }
        return events;
    }, [personalEvents, today]);

    const { data: habits = [], isLoading: habitsLoading } = useHabitsWeekly({
        start: habitsRangeStart,
        end: nextWeekISO,
    });

    useRouteFocus();

    const { onNextSection, onPrevSection } = useSectionNav();
    useKeyboardShortcuts({ onNextSection, onPrevSection });

    const tagFilteredTasks = useMemo(() => {
        let next = activeTagId
            ? tasks.filter((task) => task.tagIds?.includes(activeTagId))
            : tasks;

        if (activeDefinition && intelligenceEnabled && focusViewsEnabled) {
            next = applyFocusView(next, activeDefinition);
        }

        return next;
    }, [activeDefinition, activeTagId, focusViewsEnabled, intelligenceEnabled, tasks]);

    const projectById = useMemo(
        () => new Map(projects.map((project) => [project.id, project] as const)),
        [projects],
    );

    const groupedItems = useMemo<Record<UpcomingBucketKey, UpcomingViewerItem[]>>(() => {
        const grouped: Record<UpcomingBucketKey, UpcomingViewerItem[]> = {
            overdue: [],
            today: [],
            tomorrow: [],
            nextWeek: [],
        };

        for (const task of tagFilteredTasks) {
            if (isPassiveTimetableTask(task)) {
                continue;
            }

            const dateOnly = getTaskTimelineAnchor(task) ?? task.dueDate ?? toDateOnly(task.scheduledStart);
            if (!dateOnly) continue;

            const bucket = classifyUpcomingBucket(dateOnly, todayISO, tomorrowISO, nextWeekISO);
            if (!bucket) continue;

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

                const dateOnly = toDateOnly(log.targetDate);
                if (!dateOnly) continue;

                const bucket = classifyUpcomingBucket(dateOnly, todayISO, tomorrowISO, nextWeekISO);
                if (!bucket) continue;
                // A missed routine lets go: it never shows as overdue.
                if (bucket === "nextWeek" || bucket === "overdue") continue;

                const time = routineTimeOn(habit, dateOnly);
                const habitTimeLabel = time ? formatTime(`${dateOnly}T${time}:00`) : null;

                grouped[bucket].push({
                    id: `habit-${habit.id}-${dateOnly}`,
                    kind: "habit",
                    title: habit.title,
                    dueDate: dateOnly,
                    dateLabel: "Due",
                    sortAt: time ? `${dateOnly}T${time}:00` : `${dateOnly}T12:00:00`,
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
                        isAllDay: item.task!.isAllDay,
                        effort: item.task!.effort,
                        waitingOn: item.task!.waitingOn ?? null,
                        notBefore: item.task!.notBefore ?? null,
                        durationEstimate: item.task!.durationEstimate,
                    }));
                const ranked = rankTasks(rankable, { routeContext: "upcoming", lowStimulation: lowStimulationMode });
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
    }, [activeTagId, habits, nextWeekISO, projectById, sortMode, tagFilteredTasks, todayISO, tomorrowISO, intelligenceEnabled, smartSortEnabled, lowStimulationMode]);

    const totalVisible = groupedItems.overdue.length + groupedItems.today.length + groupedItems.tomorrow.length + groupedItems.nextWeek.length;
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

    const sections = UPCOMING_SECTIONS.map((section) => ({
        key: section.key,
        title: section.title,
        icon: section.icon,
        accentClass: section.accentClass,
        count: groupedItems[section.key].length,
        listContent: renderUpcomingBucket(section.title, section.key, groupedItems[section.key]),
        boardContent: renderUpcomingBucket(section.title, section.key, groupedItems[section.key], "board"),
    }));

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
                {upcomingEvents.length > 0 && (
                    <div className="pb-2">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-nav-schedule/80">
                                Upcoming events
                            </p>
                            <button
                                type="button"
                                onClick={() => navigate("/events")}
                                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                            >
                                Manage events
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {upcomingEvents.map(({ event: evt, dateStr }) => (
                                <button
                                    key={`${evt.id}-${dateStr}`}
                                    type="button"
                                    onClick={() => navigate(`/schedule?date=${dateStr}&view=day`)}
                                    className="inline-flex items-center gap-2 rounded-full border border-accent-nav-schedule/20 bg-accent-nav-schedule/12 px-3 py-1 text-xs font-medium text-accent-nav-schedule transition-colors hover:bg-accent-nav-schedule/18"
                                >
                                    {evt.emoji ?? "🎉"} {evt.label}
                                    <span className="text-accent-nav-schedule/60">{formatShortDate(dateStr)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
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
