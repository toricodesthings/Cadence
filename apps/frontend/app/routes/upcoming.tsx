import { StartupSuspense as Suspense } from "../components/shared/StartupSuspense";
import { useTaskDetailsRequest } from "../hooks/ui/use-task-details-request";
import { useMemo, useState, lazy } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DayEventRows, type DayEvent } from "../components/events/DayEventRows";
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
import { FURTHER_OUT_OPEN_PARAM, useFurtherOutSection, type FurtherOutItem } from "../components/upcoming/FurtherOutSection";
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
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { useKeyboardShortcuts } from "../hooks/core/use-keyboard-shortcuts";
import { useSectionNav } from "../hooks/ui/use-section-nav";
import { useSettings } from "../hooks/core/use-settings";
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import { addDays, wallTimeOf, type LocalDate } from "@cadence/domain/time";
import { dayOfInstant, formatShortDate, formatTime, formatWallTime, fromTimeValue, nlpClock } from "../lib/utils/date-format";
import { getUserZone, useToday } from "../lib/utils/user-zone";
import { getTaskTimelineAnchor, isPassiveTimetableTask } from "../lib/utils/task/task-scheduling";
import { getMaterialRankingLabel } from "../lib/utils/ranking-reasons";
import type { SortMode } from "../lib/utils/task/sort-tasks";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";
import { rankTasks } from "@cadence/nlp/ranking";
import type { RankableTask } from "@cadence/nlp/ranking";
import type { Task } from "@cadence/contracts/task";
import type { Project } from "@cadence/contracts/project";

const LazyFocusViewBar = lazy(() => import("../components/focus-views/FocusViewBar").then((m) => ({ default: m.FocusViewBar })));

type UpcomingBucketKey = "overdue" | "today" | "tomorrow" | "nextWeek";

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
];

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

function classifyUpcomingBucket(dateOnly: LocalDate, todayISO: LocalDate, tomorrowISO: LocalDate, nextWeekISO: LocalDate): UpcomingBucketKey | null {
    if (dateOnly < todayISO) return "overdue";
    if (dateOnly === todayISO) return "today";
    if (dateOnly === tomorrowISO) return "tomorrow";
    if (dateOnly > tomorrowISO && dateOnly <= nextWeekISO) return "nextWeek";
    return null;
}

type Buckets = Record<UpcomingBucketKey, UpcomingViewerItem[]>;
type RangeHabit = NonNullable<ReturnType<typeof useHabitsRange>["data"]>[number];

function taskItem(task: Task, day: LocalDate, project: Project | undefined): UpcomingViewerItem {
    return {
        id: task.id,
        kind: "task",
        title: task.title,
        dueDate: day,
        dateLabel: task.dueDate ? "Due" : "Scheduled",
        sortAt: getTaskSortAt(task, day),
        timeLabel: task.scheduledStart ? formatTime(task.scheduledStart) : null,
        projectId: task.projectId,
        projectName: project?.name ?? null,
        projectColor: project?.colorAccent ?? null,
        projectEmoji: project?.emoji ?? null,
        task,
        rationaleLabel: null,
    };
}

/** A routine's open days, today and tomorrow only: a missed routine lets go, it never shows as overdue. */
function habitItems(habit: RangeHabit, week: { today: LocalDate; tomorrow: LocalDate; nextWeek: LocalDate }): [UpcomingBucketKey, UpcomingViewerItem][] {
    const logs = [...(habit.logs ?? [])].sort((a, b) => a.targetDate.localeCompare(b.targetDate));
    return logs.flatMap((log): [UpcomingBucketKey, UpcomingViewerItem][] => {
        const day = log.targetDate;
        const bucket = log.status === "PENDING" && day ? classifyUpcomingBucket(day, week.today, week.tomorrow, week.nextWeek) : null;
        if (bucket !== "today" && bucket !== "tomorrow") return [];
        // A routine at set times lists at its next open time (its first on a later day).
        const times = habit.times?.length ? habit.times : null;
        const time = times
            ? nextOpenTime(times, timeMarksOn(times, log), day === week.today ? wallTimeOf(new Date(), getUserZone()) : "00:00")
            : routineTimeOn(habit, day);
        return [[bucket, {
            id: `habit-${habit.id}-${day}`,
            kind: "habit",
            title: habit.title,
            dueDate: day,
            dateLabel: "Due",
            sortAt: Date.parse(fromTimeValue(day, time ?? "12:00")),
            timeLabel: time ? `${times ? "Next at " : ""}${formatWallTime(time)}` : null,
            projectId: null,
            projectName: null,
            projectColor: null,
            projectEmoji: null,
            task: null,
            habitId: habit.id,
            habitTargetDate: day,
            emoji: habit.emoji,
            rationaleLabel: null,
        }]];
    });
}

/** Smart sort: ranked tasks first, each with its reason, then routines in their place. */
function rankBucket(items: UpcomingViewerItem[]): UpcomingViewerItem[] {
    const tasks = items.filter((item): item is UpcomingViewerItem & { task: Task } => item.kind === "task" && Boolean(item.task));
    const rankable: RankableTask[] = tasks.map(({ task }) => ({
        id: task.id,
        priority: task.priority,
        isPinned: task.isPinned,
        orderIndex: task.orderIndex,
        state: task.state,
        dueDate: task.dueDate,
        scheduledStart: task.scheduledStart,
        scheduledEnd: task.scheduledEnd,
        effort: task.effort,
        waitingOn: task.waitingOn ?? null,
        notBefore: task.notBefore ?? null,
        durationEstimate: task.durationEstimate,
    }));
    const byId = new Map(tasks.map((item) => [item.task.id, item]));
    const ranked = rankTasks(rankable, { routeContext: "upcoming", clock: nlpClock(), dayOf: dayOfInstant }).flatMap((entry) => {
        const item = byId.get(entry.task.id);
        return item ? [{ ...item, rationaleLabel: getMaterialRankingLabel(entry.reasons) }] : [];
    });
    return [...ranked, ...items.filter((item) => item.kind !== "task")];
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
    const [searchParams] = useSearchParams();

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

    const groupedItems = useMemo<Buckets>(() => {
        const week = { today: todayISO, tomorrow: tomorrowISO, nextWeek: nextWeekISO };
        const grouped: Buckets = { overdue: [], today: [], tomorrow: [], nextWeek: [] };
        for (const task of tagFilteredTasks) {
            if (isPassiveTimetableTask(task)) continue;
            const day = getTaskTimelineAnchor(task, todayISO) ?? task.dueDate;
            const bucket = day && classifyUpcomingBucket(day, todayISO, tomorrowISO, nextWeekISO);
            if (bucket) grouped[bucket].push(taskItem(task, day, task.projectId ? projectById.get(task.projectId) : undefined));
        }
        for (const habit of activeTagId ? [] : habits) {
            for (const [bucket, item] of habitItems(habit, week)) grouped[bucket].push(item);
        }

        const buckets = Object.keys(grouped) as UpcomingBucketKey[];
        if (intelligenceEnabled && smartSortEnabled && sortMode === "smart") {
            for (const bucket of buckets) grouped[bucket] = rankBucket(grouped[bucket]);
        } else {
            const comparator = getUpcomingComparator(sortMode);
            for (const bucket of buckets) grouped[bucket].sort(comparator);
        }
        return grouped;
    }, [activeTagId, habits, nextWeekISO, projectById, sortMode, tagFilteredTasks, todayISO, tomorrowISO, intelligenceEnabled, smartSortEnabled]);

    // Past the week: Further out (tasks only; routines and yearly events keep to the week).
    const furtherItems = useMemo(() => tagFilteredTasks.flatMap((task): FurtherOutItem[] => {
        if (isPassiveTimetableTask(task)) return [];
        const day = getTaskTimelineAnchor(task, todayISO) ?? task.dueDate;
        return day && day > nextWeekISO ? [{ task, dueDate: day }] : [];
    }), [nextWeekISO, tagFilteredTasks, todayISO]);

    const totalVisible = groupedItems.overdue.length + groupedItems.today.length + groupedItems.tomorrow.length + groupedItems.nextWeek.length + furtherItems.length;
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
    const dayEvents: Record<UpcomingBucketKey, DayEvent[]> = { overdue: [], today: [], tomorrow: [], nextWeek: [] };
    for (const { event, dateStr } of upcomingEvents) {
        const bucket = classifyUpcomingBucket(dateStr, todayISO, tomorrowISO, nextWeekISO);
        if (bucket) dayEvents[bucket].push({ ...event, dateStr, dateLabel: bucket === "nextWeek" ? formatShortDate(dateStr) : null });
    }

    const furtherSection = useFurtherOutSection({
        items: furtherItems,
        today: todayISO,
        focusTaskId: focusParams?.focusKind === "task" ? focusParams.focusId : undefined,
        openRequested: searchParams.has(FURTHER_OUT_OPEN_PARAM),
        compact: shell.isCompact,
        renderTasks: (furtherTasks, cardVariant) => (
            <TaskList
                tasks={furtherTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={handleSelectTask}
                reorderable={false}
                {...(cardVariant ? { cardVariant } : {})}
            />
        ),
    });

    const sections = [...UPCOMING_SECTIONS.map((section) => ({
        key: section.key,
        title: section.title,
        icon: section.icon,
        accentClass: section.accentClass,
        count: groupedItems[section.key].length,
        description: dayEvents[section.key].length > 0 ? <DayEventRows events={dayEvents[section.key]} /> : undefined,
        listContent: renderUpcomingBucket(section.title, section.key, groupedItems[section.key]),
        boardContent: (
            <>
                <DayEventRows events={dayEvents[section.key]} className="mb-2.5" />
                {renderUpcomingBucket(section.title, section.key, groupedItems[section.key], "board")}
            </>
        ),
    })), ...(furtherSection ? [furtherSection] : [])];

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
