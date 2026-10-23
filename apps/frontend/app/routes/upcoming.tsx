import { TaskRouteControls } from "../components/shared/TaskRouteControls";
import { useTaskIntelligence } from "../hooks/core/use-task-intelligence";
import { useTaskDetailSelection } from "../hooks/ui/use-task-detail-selection";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DayEventRows, type DayEvent } from "../components/events/DayEventRows";
import { Inbox, CalendarRange, Layers3, Sunrise, Sun } from "lucide-react";
import { MainLayout } from "../components/layout/MainLayout";
import { AgendaHabitDivider } from "../components/shared/AgendaRow";
import { RoutineAgendaRow } from "../components/shared/RoutineAgendaRow";
import { BucketedRouteBody } from "../components/shared/BucketedCollectionView";
import { PhoneTaskDetails, TaskDetailsRail } from "../components/shared/TaskDetailsPanels";
import { TaskList } from "../components/tasks/TaskList";
import { FURTHER_OUT_OPEN_PARAM, useFurtherOutSection, type FurtherOutItem } from "../components/upcoming/FurtherOutSection";
import { PageContent } from "../components/layout/PageLayout";
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
import { usePersonalEvents } from "../hooks/calendar/use-personal-events";
import { addDays, wallTimeOf, type LocalDate } from "@cadence/domain/time";
import { dayOfInstant, formatShortDate, formatTime, formatWallTime, fromTimeValue, nlpClock } from "../lib/utils/date-format";
import { getUserZone, useToday } from "../lib/utils/user-zone";
import { getTaskTimelineAnchor, isPassiveTimetableTask } from "../lib/utils/task/task-scheduling";
import { rankTasksForRoute } from "../lib/utils/ranking-reasons";
import type { SortMode } from "../lib/utils/task/sort-tasks";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";
import type { Task } from "@cadence/contracts/task";
import type { Project } from "@cadence/contracts/project";


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
        icon: Sun,
        accentClass: "text-accent-primary",
    },
    {
        key: "tomorrow",
        title: "Tomorrow",
        icon: Sunrise,
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

type Compare = (a: UpcomingViewerItem, b: UpcomingViewerItem) => number;

/** Soonest first, then by title. */
const byTime: Compare = (a, b) => (a.sortAt !== b.sortAt ? a.sortAt - b.sortAt : a.title.localeCompare(b.title));
/** Highest priority first, then soonest. */
const byPriority: Compare = (a, b) => {
    const pa = a.task?.priority ?? 0;
    const pb = b.task?.priority ?? 0;
    return pa !== pb ? pb - pa : byTime(a, b);
};
/** The list's own order. */
const byManual: Compare = (a, b) => (a.task?.orderIndex ?? 0) - (b.task?.orderIndex ?? 0);

function getUpcomingComparator(mode: SortMode): Compare {
    if (mode === "priority") return byPriority;
    return mode === "manual" ? byManual : byTime;
}

/** Each bucket in its order: ranked when smart sort is on and chosen, else by the chosen comparator. */
function sortBuckets(grouped: Buckets, smart: boolean, sortMode: SortMode) {
    const buckets = Object.keys(grouped) as UpcomingBucketKey[];
    if (smart) {
        for (const bucket of buckets) grouped[bucket] = rankBucket(grouped[bucket]);
        return;
    }
    const comparator = getUpcomingComparator(sortMode);
    for (const bucket of buckets) grouped[bucket].sort(comparator);
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
    const byId = new Map(tasks.map((item) => [item.task.id, item]));
    const { tasks: rankedTasks, rationaleByTaskId } = rankTasksForRoute(tasks.map(({ task }) => task), "upcoming");
    const ranked = rankedTasks.map((task) => ({ ...byId.get(task.id)!, rationaleLabel: rationaleByTaskId[task.id] ?? null }));
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
    const { sortMode, setSortMode } = useSortMode("upcoming");
    const selection = useTaskDetailSelection();
    const { selectedTaskId, setSelectedTaskId, setMobilePanelOpen, handleSelectTask } = selection;


    const { mutate: resolveHabit } = useResolveHabit();
    const shell = useShellMode();
    const { smartSortEnabled, intelligenceEnabled, focusViewsEnabled } = useTaskIntelligence();

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

        sortBuckets(grouped, intelligenceEnabled && smartSortEnabled && sortMode === "smart", sortMode);
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

    const handleCompleteHabit = (item: UpcomingViewerItem) => {
        if (item.kind !== "habit" || !item.habitId || !item.habitTargetDate) return;
        resolveHabit({ habitId: item.habitId, targetDate: item.habitTargetDate, status: "COMPLETED" });
    };

    const sidePanel = (
        <TaskDetailsRail selection={selection} ariaLabel="Resize upcoming sidebar" />
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
        const rationaleByTaskId = Object.fromEntries(taskItems.map((item) => [item.task!.id, item.rationaleLabel]));

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
                        {taskItems.length > 0 ? <AgendaHabitDivider label="Routines" /> : null}
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
            headerRight={(
                <TaskRouteControls
                    routeKey="upcoming"
                    title="Upcoming controls"
                    view={view}
                    onViewChange={setView}
                    sortMode={sortMode}
                    onSortModeChange={setSortMode}
                    onOpenDetails={selectedTaskId ? () => setMobilePanelOpen(true) : undefined}
                />
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
            <BucketedRouteBody view={view} sections={sections} isLoading={isLoading} isEmpty={totalVisible === 0} empty="upcoming" />

            <PhoneTaskDetails selection={selection} ariaLabel="Upcoming details" />
        </MainLayout>
    );
}
