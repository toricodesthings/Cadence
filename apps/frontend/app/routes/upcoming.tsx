import { useMemo, useState } from "react";
import { useDragScroll } from "../hooks/use-drag-scroll";
import {
    AlertTriangle,
    CalendarRange,
    Check,
    Clock3,
    Layers3,
    Circle,
    Repeat,
    Sunrise,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "../components/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { TaskCheckbox } from "../components/tasks/TaskCheckbox";
import { PageContent } from "../components/layout/page-layout";
import { ViewToggle } from "../components/shared/ViewToggle";
import { SortMenu } from "../components/shared/SortMenu";
import { useTasks } from "../hooks/tasks";
import { useProjects } from "../hooks/projects";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { useApiClient } from "../hooks/use-api-client";
import { useViewMode } from "../hooks/use-view-mode";
import { useSortMode } from "../hooks/use-sort-mode";
import { useShellMode } from "../hooks/use-shell-mode";
import { useRouteFocus } from "../hooks/use-route-focus";
import { invalidateEverywhere } from "../lib/api/workspace-cache";
import { queryKeys } from "../lib/api/query-keys";
import { addDays, formatShortDate, formatTime, parseLocalDate, toISODate } from "../lib/utils/date-format";
import { toTaskDateOnly } from "../lib/utils/task-scheduling";
import type { SortMode } from "../lib/utils/sort-tasks";
import type { Task } from "../types/task";

type UpcomingBucketKey = "overdue" | "tomorrow" | "nextWeek";

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
        key: "tomorrow",
        title: "Tomorrow",
        icon: Sunrise,
        accentClass: "text-lantern",
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
            aria-label={isResolving ? "Completing habit" : "Mark habit complete"}
            className="group relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 cursor-pointer disabled:cursor-wait lg:h-8 lg:w-8"
        >
            <span
                className={`
                    relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,color] duration-200 lg:h-6 lg:w-6
                    ${isResolving
                        ? "border-lantern/60 bg-lantern/15 text-lantern"
                        : "border-moonlit/65 text-moonlit/80 group-hover:border-lantern/50 group-hover:text-lantern"
                    }
                `}
            >
                {isResolving ? <Clock3 className="h-3 w-3 animate-pulse" /> : <Check className="h-3 w-3" />}
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
}: {
    item: UpcomingViewerItem;
    isSelected: boolean;
    onSelect: (taskId: string) => void;
    onOpenHabits: () => void;
    onCompleteHabit: (item: UpcomingViewerItem) => Promise<void>;
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

    return (
        <div
            className={`
                group flex items-start gap-3 rounded-[26px] px-2 py-3 transition-[background-color,box-shadow] duration-200
                ${isSelected ? "bg-white/[0.04]" : "hover:bg-white/[0.028]"}
            `}
        >
            <UpcomingCompletionButton item={item} onCompleteHabit={onCompleteHabit} />

            <button
                type="button"
                onClick={handleOpen}
                className="min-w-0 flex-1 rounded-2xl px-1 py-0.5 text-left"
                aria-label={item.kind === "habit" ? `Open habits for ${item.title}` : `Open ${item.title}`}
            >
                <div className="flex items-start gap-2">
                    <span className="min-w-0 truncate text-[15px] font-medium leading-snug text-twilight-text sm:text-[15.5px]">
                        {item.title}
                    </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-twilight-text-soft">
                    <span className="inline-flex items-center gap-1.5 font-medium text-lantern">
                        <CalendarRange size={12} aria-hidden="true" />
                        {item.dateLabel} {formatShortDate(item.dueDate)}
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

                    {item.kind === "habit" ? (
                        <span className="inline-flex items-center gap-1.5 text-moonlit">
                            <Repeat size={12} aria-hidden="true" />
                            Habit
                        </span>
                    ) : null}
                </div>
            </button>
        </div>
    );
}

function UpcomingSectionDivider({
    title,
    icon: Icon,
    accentClass,
    count,
}: {
    title: string;
    icon: typeof AlertTriangle;
    accentClass: string;
    count: number;
}) {
    return (
        <div className="flex items-center gap-3 pt-2">
            <div className="flex items-center gap-2">
                <Icon size={14} className={accentClass} aria-hidden="true" />
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                    {title}
                </h2>
            </div>
            <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{count}</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
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

function UpcomingSection({
    title,
    icon,
    accentClass,
    items,
    selectedTaskId,
    onSelectTask,
    onOpenHabits,
    onCompleteHabit,
}: {
    title: string;
    icon: typeof AlertTriangle;
    accentClass: string;
    items: UpcomingViewerItem[];
    selectedTaskId: string | null;
    onSelectTask: (taskId: string) => void;
    onOpenHabits: () => void;
    onCompleteHabit: (item: UpcomingViewerItem) => Promise<void>;
}) {
    return (
        <section className="flex flex-col">
            <UpcomingSectionDivider
                title={title}
                icon={icon}
                accentClass={accentClass}
                count={items.length}
            />

            <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
                {items.length > 0 ? (
                    items.map((item) => (
                        <UpcomingTaskRow
                            key={item.id}
                            item={item}
                            isSelected={item.kind === "task" && selectedTaskId === item.id}
                            onSelect={onSelectTask}
                            onOpenHabits={onOpenHabits}
                            onCompleteHabit={onCompleteHabit}
                        />
                    ))
                ) : (
                    <UpcomingEmptyState title={title} />
                )}
            </div>
        </section>
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
    const queryClient = useQueryClient();
    const client = useApiClient();
    const boardScroll = useDragScroll();
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
            tomorrow: [],
            nextWeek: [],
        };

        for (const task of tagFilteredTasks) {
            const dateOnly = task.dueDate ?? toDateOnly(task.scheduledStart);
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

    const totalVisible = groupedItems.overdue.length + groupedItems.tomorrow.length + groupedItems.nextWeek.length;
    const isLoading = tasksLoading || habitsLoading;

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId((current) => (current === taskId ? null : taskId));
        if (!shell.isWide) setMobilePanelOpen(true);
    };

    const handleCompleteHabit = async (item: UpcomingViewerItem) => {
        if (item.kind !== "habit" || !item.habitId || !item.habitTargetDate) return;

        await client.api.habits[":id"].resolve.$post({
            param: { id: item.habitId },
            json: { targetDate: item.habitTargetDate, status: "COMPLETED" },
        });

        await invalidateEverywhere(queryClient, queryKeys.habits.all);
    };

    const sidePanel = shell.isWide && selectedTaskId ? (
        <ResizableSidePanel ariaLabel="Resize upcoming sidebar">
            <TaskEditPanel
                key={`edit-${selectedTaskId}`}
                taskId={selectedTaskId}
                onClose={() => setSelectedTaskId(null)}
            />
        </ResizableSidePanel>
    ) : null;

    return (
        <MainLayout
            requireAuth
            sidePanel={sidePanel}
            headerCenter={<ViewToggle view={view} onViewChange={setView} />}
            headerRight={<SortMenu mode={sortMode} onModeChange={setSortMode} />}
            contentWidth="default"
            shellHeader={{
                title: "Upcoming",
                eyebrow: "Horizon",
                icon: <CalendarRange size={18} aria-hidden="true" />,
                accentColor: "var(--color-nav-upcoming)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="default">
                    {isLoading ? (
                        <TaskListSkeleton />
                    ) : totalVisible > 0 ? (
                        view === "list" ? (
                            <div className="flex flex-col gap-8">
                                {UPCOMING_SECTIONS.map((section) => (
                                    <UpcomingSection
                                        key={section.key}
                                        title={section.title}
                                        icon={section.icon}
                                        accentClass={section.accentClass}
                                        items={groupedItems[section.key]}
                                        selectedTaskId={selectedTaskId}
                                        onSelectTask={handleSelectTask}
                                        onOpenHabits={() => {
                                            window.location.href = "/habits";
                                        }}
                                        onCompleteHabit={handleCompleteHabit}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div
                                ref={boardScroll.ref}
                                className="-mx-4 overflow-x-auto scrollbar-thin cursor-grab px-4 pb-2 sm:-mx-6 sm:px-6"
                                onPointerDown={boardScroll.onPointerDown}
                                onPointerMove={boardScroll.onPointerMove}
                                onPointerUp={boardScroll.onPointerUp}
                                onPointerCancel={boardScroll.onPointerCancel}
                            >
                                <div className="flex min-w-max gap-4">
                                {UPCOMING_SECTIONS.map((section) => (
                                    <section key={section.key} className="w-[min(24rem,80vw)] shrink-0 rounded-[28px] border border-twilight-border/50 bg-twilight-surface/20 p-4">
                                        <UpcomingSectionDivider
                                            title={section.title}
                                            icon={section.icon}
                                            accentClass={section.accentClass}
                                            count={groupedItems[section.key].length}
                                        />
                                        <div className="mt-3 flex flex-col divide-y divide-white/[0.05]">
                                            {groupedItems[section.key].length > 0 ? (
                                                groupedItems[section.key].map((item) => (
                                                    <UpcomingTaskRow
                                                        key={item.id}
                                                        item={item}
                                                        isSelected={item.kind === "task" && selectedTaskId === item.id}
                                                        onSelect={handleSelectTask}
                                                        onOpenHabits={() => {
                                                            window.location.href = "/habits";
                                                        }}
                                                        onCompleteHabit={handleCompleteHabit}
                                                    />
                                                ))
                                            ) : (
                                                <UpcomingEmptyState title={section.title} />
                                            )}
                                        </div>
                                    </section>
                                ))}
                                </div>
                            </div>
                        )
                    ) : (
                        <EmptyState variant="upcoming" />
                    )}
                </PageContent>
            </ScrollAreaWrapper>

            {!shell.isWide && selectedTaskId && (
                <ResponsiveOverlayPanel
                    ariaLabel="Upcoming details"
                    open={mobilePanelOpen}
                    onClose={() => setMobilePanelOpen(false)}
                    title="Task details"
                >
                    <TaskEditPanel
                        key={`upcoming-mobile-edit-${selectedTaskId}`}
                        taskId={selectedTaskId}
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
