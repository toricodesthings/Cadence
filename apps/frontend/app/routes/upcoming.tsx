import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle,
    CalendarRange,
    Clock3,
    Layers3,
    Circle,
    Repeat,
    Sunrise,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "../components/layout/MainLayout";
import { BucketedCollectionView } from "../components/shared/BucketedCollectionView";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { TaskCheckbox } from "../components/tasks/TaskCheckbox";
import { PageContent } from "../components/layout/PageLayout";
import { ViewToggle } from "../components/shared/ViewToggle";
import { SortMenu } from "../components/shared/SortMenu";
import { ControlsSheet } from "../components/shared/ControlsSheet";
import { useTasks } from "../hooks/tasks";
import { useProjects } from "../hooks/projects";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { useApiClient } from "../hooks/auth/use-api-client";
import { useViewMode } from "../hooks/ui/use-view-mode";
import { useSortMode } from "../hooks/ui/use-sort-mode";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { invalidateEverywhere } from "../lib/api/workspace-cache";
import { queryKeys } from "../lib/api/query-keys";
import { addDays, formatShortDate, formatTime, toISODate } from "../lib/utils/date-format";
import { getTaskTimelineAnchor, isPassiveTimetableTask, toTaskDateOnly } from "../lib/utils/task-scheduling";
import type { SortMode } from "../lib/utils/sort-tasks";
import type { Task } from "../types/task";

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
}

const UPCOMING_SECTIONS: Array<{
    key: UpcomingBucketKey;
    title: string;
    icon: typeof AlertTriangle;
    accentClass: string;
}> = [
    {
        key: "overdue",
        title: "Overdue",
        icon: AlertTriangle,
        accentClass: "text-[var(--color-priority-urgent)]",
    },
    {
        key: "today",
        title: "Today",
        icon: Sunrise,
        accentClass: "text-lantern",
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

function UpcomingCompletionButton({
    item,
    onCompleteHabit,
}: {
    item: UpcomingViewerItem;
    onCompleteHabit: (item: UpcomingViewerItem) => Promise<void>;
}) {
    const [isResolving, setIsResolving] = useState(false);

    if (item.kind === "task" && item.task) {
        return <TaskCheckbox task={item.task} />;
    }

    const handleResolve = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (isResolving) return;

        setIsResolving(true);
        try {
            await onCompleteHabit(item);
        } finally {
            setIsResolving(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleResolve}
            data-no-dnd="true"
            disabled={isResolving}
            aria-label={isResolving ? "Completing routine" : "Mark routine complete"}
            className="group relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 cursor-pointer disabled:cursor-wait lg:h-8 lg:w-8"
        >
            <span
                className={`
                    relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,color] duration-200 lg:h-6 lg:w-6
                    ${isResolving
                        ? "border-lantern/60 bg-lantern/15 text-lantern"
                        : "border-moonlit/45 text-moonlit/80 group-hover:border-moonlit/70 group-hover:text-moonlit"
                    }
                `}
            >
                {isResolving ? (
                    <Clock3 className="h-3 w-3 animate-pulse" />
                ) : (
                    <span className="relative flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
                        <span className="h-2 w-2 rounded-full bg-moonlit/80" />
                    </span>
                )}
            </span>
        </button>
    );
}

function UpcomingTaskRow({
    item,
    isSelected,
    onSelect,
    onOpenHabits,
    onCompleteHabit,
    bucketKey,
}: {
    item: UpcomingViewerItem;
    isSelected: boolean;
    onSelect: (taskId: string) => void;
    onOpenHabits: () => void;
    onCompleteHabit: (item: UpcomingViewerItem) => Promise<void>;
    bucketKey: UpcomingBucketKey;
}) {
    const handleOpen = () => {
        if (item.kind === "habit") {
            onOpenHabits();
            return;
        }

        if (item.task) {
            onSelect(item.task.id);
        }
    };

    const isHabit = item.kind === "habit";
    const habitEyebrow = bucketKey === "overdue" ? "Missed routine" : "Routine";
    const habitPrimaryMeta = bucketKey === "overdue" ? `Missed ${formatShortDate(item.dueDate)}` : "Today ritual";

    return (
        <div
            className={`
                group flex items-start gap-3 rounded-[26px] px-2 py-3 transition-[background-color,border-color,box-shadow] duration-200
                ${isHabit
                    ? `${isSelected ? "bg-moonlit/[0.07]" : "bg-moonlit/[0.035] hover:bg-moonlit/[0.06]"}`
                    : isSelected ? "bg-white/[0.04]" : "hover:bg-white/[0.028]"}
            `}
        >
            <UpcomingCompletionButton item={item} onCompleteHabit={onCompleteHabit} />

            <button
                type="button"
                onClick={handleOpen}
                className="min-w-0 flex-1 rounded-2xl px-1 py-0.5 text-left"
                aria-label={item.kind === "habit" ? `Open routines for ${item.title}` : `Open ${item.title}`}
            >
                {isHabit ? (
                    <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-moonlit/90">
                        <Repeat size={11} aria-hidden="true" />
                        <span>{habitEyebrow}</span>
                    </div>
                ) : null}

                <div className="flex items-start gap-2">
                    <span className="min-w-0 truncate text-[15px] font-medium leading-snug text-twilight-text sm:text-[15.5px]">
                        {item.title}
                    </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-twilight-text-soft">
                    <span className={`inline-flex items-center gap-1.5 font-medium ${isHabit ? "text-moonlit" : "text-lantern"}`}>
                        {isHabit ? <Repeat size={12} aria-hidden="true" /> : <CalendarRange size={12} aria-hidden="true" />}
                        {isHabit ? habitPrimaryMeta : `${item.dateLabel} ${formatShortDate(item.dueDate)}`}
                    </span>

                    {item.timeLabel ? (
                        <span className="inline-flex items-center gap-1.5">
                            <Clock3 size={12} aria-hidden="true" />
                            {item.timeLabel}
                        </span>
                    ) : null}

                    {item.projectName ? (
                        <span
                            className="inline-flex items-center gap-1.5"
                            style={{ color: item.projectColor ?? "var(--color-twilight-text-soft)" }}
                        >
                            <Circle size={7} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                            {item.projectEmoji ? <span aria-hidden="true">{item.projectEmoji}</span> : null}
                            <span>{item.projectName}</span>
                        </span>
                    ) : null}
                </div>
            </button>
        </div>
    );
}

function UpcomingEmptyState({ title }: { title: string }) {
    return (
        <div className="px-14 py-3 text-[13px] italic text-twilight-text-muted/65">
            Nothing in {title.toLowerCase()}.
        </div>
    );
}

function HabitGroupDivider({ label }: { label: string }) {
    return (
        <div className="px-3 py-3">
            <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-moonlit/90">
                <Repeat size={11} aria-hidden="true" />
                <span>{label}</span>
            </div>
        </div>
    );
}

export default function Upcoming() {
    const { data: tasks = [], isLoading: tasksLoading } = useTasks({ state: "ACTIVE" });
    const { data: projects = [] } = useProjects();
    const { activeTagId } = useTagFilterStore();
    const { view, setView } = useViewMode();
    const { sortMode, setSortMode } = useSortMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const queryClient = useQueryClient();
    const client = useApiClient();
    const shell = useShellMode();

    const today = new Date();
    const todayISO = toISODate(today);
    const tomorrowISO = toISODate(addDays(today, 1));
    const nextWeekISO = toISODate(addDays(today, 7));
    const habitsRangeStart = toISODate(addDays(today, -30));

    const { data: habits = [], isLoading: habitsLoading } = useHabitsWeekly({
        start: habitsRangeStart,
        end: nextWeekISO,
    });

    useRouteFocus();

    const tagFilteredTasks = activeTagId
        ? tasks.filter((task) => task.tagIds?.includes(activeTagId))
        : tasks;

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
            });
        }

        for (const habit of activeTagId ? [] : habits) {
            const project = null;

            for (const log of habit.logs ?? []) {
                if (log.status !== "PENDING") continue;

                const dateOnly = toDateOnly(log.targetDate);
                if (!dateOnly) continue;

                const bucket = classifyUpcomingBucket(dateOnly, todayISO, tomorrowISO, nextWeekISO);
                if (!bucket) continue;
                if (bucket !== "overdue" && bucket !== "today") continue;

                const habitTimeLabel = habit.targetTime
                    ? formatTime(`${dateOnly}T${habit.targetTime}:00`)
                    : null;

                grouped[bucket].push({
                    id: `habit-${habit.id}-${dateOnly}`,
                    kind: "habit",
                    title: habit.title,
                    dueDate: dateOnly,
                    dateLabel: "Due",
                    sortAt: habit.targetTime ? `${dateOnly}T${habit.targetTime}:00` : `${dateOnly}T12:00:00`,
                    timeLabel: habitTimeLabel,
                    projectId: null,
                    projectName: project,
                    projectColor: null,
                    projectEmoji: null,
                    task: null,
                    habitId: habit.id,
                    habitTargetDate: log.targetDate,
                });
            }
        }

        const comparator = getUpcomingComparator(sortMode);
        for (const bucket of Object.keys(grouped) as UpcomingBucketKey[]) {
            grouped[bucket].sort(comparator);
        }

        return grouped;
    }, [activeTagId, habits, nextWeekISO, projectById, sortMode, tagFilteredTasks, todayISO, tomorrowISO]);

    const totalVisible = groupedItems.overdue.length + groupedItems.today.length + groupedItems.tomorrow.length + groupedItems.nextWeek.length;
    const isLoading = tasksLoading || habitsLoading;

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId((current) => (current === taskId ? null : taskId));
        if (!shell.isWide) {
            setMobileDetailMode("peek");
            setMobilePanelOpen(true);
        }
    };

    const handleCompleteHabit = async (item: UpcomingViewerItem) => {
        if (item.kind !== "habit" || !item.habitId || !item.habitTargetDate) return;

        await client.api.habits[":id"].resolve.$post({
            param: { id: item.habitId },
            json: { targetDate: item.habitTargetDate, status: "COMPLETED" },
        });

        await invalidateEverywhere(queryClient, queryKeys.habits.all);
    };

    const panelMotion = { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const };
    const sidePanel = (
        <AnimatePresence initial={false}>
            {shell.isWide && selectedTaskId ? (
                <motion.div
                    key="upcoming-side-panel"
                    initial={{ width: 0 }}
                    animate={{ width: "auto" }}
                    exit={{ width: 0 }}
                    transition={panelMotion}
                    style={{ willChange: "width", overflow: "hidden" }}
                    className="flex h-full self-stretch shrink-0 items-stretch"
                >
                    <motion.div
                        initial={{ x: 24, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 24, opacity: 0 }}
                        transition={panelMotion}
                        style={{ willChange: "transform, opacity" }}
                        className="flex h-full min-w-0 flex-1 items-stretch"
                    >
                        <ResizableSidePanel ariaLabel="Resize upcoming sidebar">
                            <TaskEditPanel
                                key={`edit-${selectedTaskId}`}
                                taskId={selectedTaskId}
                                onClose={() => setSelectedTaskId(null)}
                            />
                        </ResizableSidePanel>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );

    const openHabits = () => {
        window.location.href = "/habits";
    };

    const renderUpcomingBucket = (title: string, bucketKey: UpcomingBucketKey, items: UpcomingViewerItem[]) => {
        if (items.length === 0) {
            return <UpcomingEmptyState title={title} />;
        }

        const taskItems = items.filter((item) => item.kind === "task");
        const habitItems = items.filter((item) => item.kind === "habit");
        const shouldSeparateHabits = habitItems.length > 0 && (bucketKey === "today" || bucketKey === "overdue");

        return (
            <div className="flex flex-col divide-y divide-white/[0.05]">
                {(shouldSeparateHabits ? taskItems : items).map((item) => (
                    <UpcomingTaskRow
                        key={item.id}
                        item={item}
                        bucketKey={bucketKey}
                        isSelected={item.kind === "task" && selectedTaskId === item.id}
                        onSelect={handleSelectTask}
                        onOpenHabits={openHabits}
                        onCompleteHabit={handleCompleteHabit}
                    />
                ))}

                {shouldSeparateHabits ? (
                    <>
                        <HabitGroupDivider label={bucketKey === "overdue" ? "Missed routines" : "Rituals today"} />
                        {habitItems.map((item) => (
                            <UpcomingTaskRow
                                key={item.id}
                                item={item}
                                bucketKey={bucketKey}
                                isSelected={false}
                                onSelect={handleSelectTask}
                                onOpenHabits={openHabits}
                                onCompleteHabit={handleCompleteHabit}
                            />
                        ))}
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
        boardContent: renderUpcomingBucket(section.title, section.key, groupedItems[section.key]),
    }));

    const sortOptions = [
        { value: "smart", label: "Smart" },
        { value: "priority", label: "Priority" },
        { value: "manual", label: "Manual" },
    ] as const;

    return (
        <MainLayout
            requireAuth
            sidePanel={sidePanel}
            headerCenter={<ViewToggle view={view} onViewChange={setView} />}
            headerRight={shell.isPhone ? (
                <ControlsSheet
                    routeKey="upcoming"
                    title="Upcoming controls"
                    sections={[
                        {
                            id: "view",
                            label: "View",
                            content: (
                                <div className="space-y-3">
                                    <p className="text-sm text-twilight-text-soft">Keep the horizon readable in list or board view.</p>
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
                                    Open task details
                                </button>
                            ) : (
                                <p className="text-sm text-twilight-text-muted">Select a task to open its detail surface.</p>
                            ),
                        },
                    ]}
                />
            ) : <SortMenu mode={sortMode} onModeChange={setSortMode} />}
            contentWidth="default"
            shellHeader={{
                title: "Upcoming",
                eyebrow: "Horizon",
                icon: <CalendarRange size={18} aria-hidden="true" />,
                accentColor: "var(--color-nav-upcoming)",
            }}
        >
            {view === "kanban" ? (
                <div className="flex-1 min-h-0 min-w-0">
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
                    <TaskEditPanel
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
