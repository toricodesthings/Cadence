import { useEffect, useMemo, useState, Suspense, lazy } from "react";
import { AnimatePresence, motion } from "framer-motion";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { AlertTriangle, CalendarClock, EyeOff, Eye, PanelRightClose, Sunrise, Repeat, Clock3, CalendarRange } from "lucide-react";
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
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { useResolveHabit } from "../hooks/habits/use-resolve-habit";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useViewMode } from "../hooks/ui/use-view-mode";
import { useSortMode } from "../hooks/ui/use-sort-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { useFocusViewStore } from "../stores/focus-view-store";
import { addDays, formatShortDate, formatTime, toISODate } from "../lib/utils/date-format";
import { getTaskTimelineAnchor, isPassiveTimetableTask, toTaskDateOnly } from "../lib/utils/task-scheduling";
import { sortTasks } from "../lib/utils/sort-tasks";
import { getRankingReasonLabel } from "../lib/utils/ranking-reasons";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";
import { rankTasks } from "@cadence/nlp/ranking";
import type { RankableTask } from "@cadence/nlp/ranking";
const LazyFocusViewBar = lazy(() => import("../components/focus-views/FocusViewBar").then(m => ({ default: m.FocusViewBar })));
import { useSettings } from "../hooks/core/use-settings";
import type { Task } from "../types/task";
import type { HabitLog } from "../types/habit";

const TIMETABLE_VISIBILITY_STORAGE_KEY = "cadence-today-hide-timetable-anchors";
const RITUALS_VISIBILITY_STORAGE_KEY = "cadence-today-hide-rituals";

type TodayBucketKey = "overdue" | "today" | "ritualsToday";

interface TodayHabitItem {
    id: string;
    habitId: string;
    title: string;
    dueDate: string;
    sortAt: string;
    timeLabel: string | null;
    targetDate: string;
    bucket: "overdue" | "today";
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

function TodayHabitCompletionButton({
    habitId,
    targetDate,
}: {
    habitId: string;
    targetDate: string;
}) {
    const resolveHabit = useResolveHabit(habitId);
    const isResolving = resolveHabit.isPending;

    const handleResolve = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (isResolving) return;
        resolveHabit.mutate({ targetDate, status: "COMPLETED" });
    };

    return (
        <button
            type="button"
            onClick={handleResolve}
            data-no-dnd="true"
            disabled={isResolving}
            aria-label={isResolving ? "Completing routine" : "Mark routine complete"}
            className="group relative mt-0.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 disabled:cursor-wait lg:h-8 lg:w-8"
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

function TodayHabitRow({
    item,
    onOpenHabits,
}: {
    item: TodayHabitItem;
    onOpenHabits: () => void;
}) {
    const isOverdue = item.bucket === "overdue";

    return (
        <div
            className={`
                group flex items-start gap-3 rounded-[26px] px-2 py-3 transition-[background-color] duration-200
                ${isOverdue ? "bg-moonlit/[0.05] hover:bg-moonlit/[0.07]" : "bg-moonlit/[0.035] hover:bg-moonlit/[0.06]"}
            `}
        >
            <TodayHabitCompletionButton habitId={item.habitId} targetDate={item.targetDate} />

            <button
                type="button"
                onClick={onOpenHabits}
                className="min-w-0 flex-1 cursor-pointer rounded-2xl px-1 py-0.5 text-left"
                aria-label={`Open habits for ${item.title}`}
            >
                <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-moonlit/90">
                    <Repeat size={11} aria-hidden="true" />
                    <span>{isOverdue ? "Missed routine" : "Routine"}</span>
                </div>

                <div className="min-w-0 truncate text-[15px] font-medium leading-snug text-twilight-text sm:text-[15.5px]">
                    {item.title}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-twilight-text-soft">
                    <span className="inline-flex items-center gap-1.5 font-medium text-moonlit">
                        <Repeat size={12} aria-hidden="true" />
                        {isOverdue ? `Missed ${formatShortDate(item.dueDate)}` : "Today ritual"}
                    </span>

                    {item.timeLabel ? (
                        <span className="inline-flex items-center gap-1.5">
                            <Clock3 size={12} aria-hidden="true" />
                            {item.timeLabel}
                        </span>
                    ) : null}
                </div>
            </button>
        </div>
    );
}

export default function TodayRoute() {
    const shell = useShellMode();
    const { view, setView } = useViewMode();
    const { sortMode, setSortMode } = useSortMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const [hideTimetableAnchors, setHideTimetableAnchors] = useState(false);
    const [hideRitualsToday, setHideRitualsToday] = useState(false);
    const todayISO = toISODate(new Date());
    const habitsRangeStart = toISODate(addDays(new Date(), -30));
    const { activeTagId } = useTagFilterStore();
    const { activeDefinition } = useFocusViewStore();
    const { data: userSettings } = useSettings();
    const smartSortEnabled = userSettings?.tasks?.intelligence?.smartSortEnabled !== false;
    const intelligenceEnabled = userSettings?.tasks?.intelligence?.nlpEnabled !== false;
    const focusViewsEnabled = userSettings?.tasks?.intelligence?.focusViewsEnabled !== false;

    useDocumentMeta(
        "Today · Cadence",
        "Review overdue work and today's commitments in one calm, focused viewer.",
    );

    useRouteFocus();

    useEffect(() => {
        if (typeof window === "undefined") return;
        setHideTimetableAnchors(window.localStorage.getItem(TIMETABLE_VISIBILITY_STORAGE_KEY) === "1");
        setHideRitualsToday(window.localStorage.getItem(RITUALS_VISIBILITY_STORAGE_KEY) === "1");
    }, []);

    const { data: tasks = [], isLoading } = useTasks({
        state: "ACTIVE",
        effectiveOnOrBeforeDate: todayISO,
    });
    const { data: habits = [], isLoading: habitsLoading } = useHabitsWeekly({
        start: habitsRangeStart,
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
        const overdue: Task[] = [];
        const today: Task[] = [];
        const timetableAnchors: Task[] = [];
        const overdueHabits: TodayHabitItem[] = [];
        const ritualsToday: TodayHabitItem[] = [];

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

        for (const habit of activeTagId ? [] : habits) {
            for (const log of habit.logs ?? []) {
                if (log.status !== "PENDING") continue;

                const dateOnly = toTaskDateOnly(log.targetDate);
                if (!dateOnly || dateOnly > todayISO) continue;

                const item: TodayHabitItem = {
                    id: `habit-${habit.id}-${dateOnly}`,
                    habitId: habit.id,
                    title: habit.title,
                    dueDate: dateOnly,
                    sortAt: habit.targetTime ? `${dateOnly}T${habit.targetTime}:00` : `${dateOnly}T12:00:00`,
                    timeLabel: habit.targetTime ? formatTime(`${dateOnly}T${habit.targetTime}:00`) : null,
                    targetDate: dateOnly,
                    bucket: dateOnly < todayISO ? "overdue" : "today",
                };

                if (item.bucket === "overdue") {
                    overdueHabits.push(item);
                } else {
                    ritualsToday.push(item);
                }
            }
        }

        const compareHabits = (a: TodayHabitItem, b: TodayHabitItem) => {
            if (a.sortAt !== b.sortAt) return a.sortAt.localeCompare(b.sortAt);
            return a.title.localeCompare(b.title);
        };

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
            const ranked = rankTasks(rankable, { routeContext: "today" });
            for (const item of ranked) {
                rationaleByTaskId[item.task.id] = getRankingReasonLabel(item.reasons);
            }
            const idOrder = new Map(ranked.map((r, i) => [r.task.id, i]));
            return [...bucket].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
        };

        return {
            overdue: sortBucket(overdue),
            today: sortBucket(today),
            timetableAnchors: sortTasks(timetableAnchors, sortMode),
            overdueHabits: overdueHabits.sort(compareHabits),
            ritualsToday: ritualsToday.sort(compareHabits),
            rationaleByTaskId,
        };
    }, [activeTagId, filteredTasks, habits, todayISO, sortMode, intelligenceEnabled, smartSortEnabled]);

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId((current) => (current === taskId ? null : taskId));
        if (!shell.isWide) {
            setMobileDetailMode("peek");
            setMobilePanelOpen(true);
        }
    };

    const panelMotion = { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const };
    const sidePanel = (
        <AnimatePresence initial={false}>
            {shell.isWide && selectedTaskId ? (
                <motion.div
                    key="today-side-panel"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={panelMotion}
                    style={{ willChange: "transform, opacity", width: 324 }}
                    className="flex h-full self-stretch shrink-0 items-stretch"
                >
                    <ResizableSidePanel ariaLabel="Resize today sidebar">
                        <TaskEditPanel
                            key={`today-edit-${selectedTaskId}`}
                            taskId={selectedTaskId}
                            onClose={() => setSelectedTaskId(null)}
                        />
                    </ResizableSidePanel>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );

    const sortOptions = [
        { value: "smart", label: "Smart order" },
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
    const visibleRitualsToday = hideRitualsToday ? [] : grouped.ritualsToday;
    const totalVisible =
        grouped.overdue.length +
        grouped.overdueHabits.length +
        grouped.today.length +
        visibleRitualsToday.length +
        visibleTimetableAnchors.length;

    const toggleTimetableAnchors = () => {
        setHideTimetableAnchors((current) => {
            const next = !current;
            if (typeof window !== "undefined") {
                window.localStorage.setItem(TIMETABLE_VISIBILITY_STORAGE_KEY, next ? "1" : "0");
            }
            return next;
        });
    };

    const toggleRitualsToday = () => {
        setHideRitualsToday((current) => {
            const next = !current;
            if (typeof window !== "undefined") {
                window.localStorage.setItem(RITUALS_VISIBILITY_STORAGE_KEY, next ? "1" : "0");
            }
            return next;
        });
    };

    const openHabits = () => {
        if (typeof window !== "undefined") {
            window.location.href = "/habits";
        }
    };

    const renderTaskBucket = (tasks: Task[], cardVariant?: "list" | "board", emptyLabel?: string) => {
        if (tasks.length > 0) {
            return (
                <TaskList
                    tasks={tasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={handleSelectTask}
                    rationaleByTaskId={grouped.rationaleByTaskId}
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

    const renderHabitBucket = (items: TodayHabitItem[], emptyLabel?: string) => {
        if (items.length === 0) {
            return (
                <div className="px-6 py-3 text-[13px] italic text-twilight-text-muted/65">
                    {emptyLabel}
                </div>
            );
        }

        return (
            <div className="flex flex-col divide-y divide-white/[0.05]">
                {items.map((item) => (
                    <TodayHabitRow key={item.id} item={item} onOpenHabits={openHabits} />
                ))}
            </div>
        );
    };

    const MAX_OVERDUE_HABITS = 3;

    const renderOverdueBucket = (cardVariant?: "list" | "board") => {
        const hasTasks = grouped.overdue.length > 0;
        const hasHabits = grouped.overdueHabits.length > 0;

        if (!hasTasks && !hasHabits) {
            return (
                <div className="px-6 py-3 text-[13px] italic text-twilight-text-muted/65">
                    Nothing in overdue.
                </div>
            );
        }

        const visibleOverdueHabits = grouped.overdueHabits.slice(0, MAX_OVERDUE_HABITS);
        const overflowCount = grouped.overdueHabits.length - visibleOverdueHabits.length;

        return (
            <div className="flex flex-col gap-3">
                {hasTasks ? <TaskList tasks={grouped.overdue} selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} rationaleByTaskId={grouped.rationaleByTaskId} {...(cardVariant ? { cardVariant } : {})} /> : null}
                {hasHabits ? (
                    <>
                        {hasTasks ? <HabitGroupDivider label="Missed routines" /> : null}
                        <div className="flex flex-col divide-y divide-white/[0.05]">
                            {visibleOverdueHabits.map((item) => (
                                <TodayHabitRow key={item.id} item={item} onOpenHabits={openHabits} />
                            ))}
                        </div>
                        {overflowCount > 0 ? (
                            <button
                                type="button"
                                onClick={openHabits}
                                className="mx-3 mt-1 inline-flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] font-medium text-moonlit/90 transition-colors hover:bg-moonlit/[0.07]"
                            >
                                <Repeat size={13} aria-hidden="true" />
                                {overflowCount} more routine{overflowCount > 1 ? "s" : ""} need a check-in
                            </button>
                        ) : null}
                    </>
                ) : null}
            </div>
        );
    };

    const sections = [
        {
            key: "overdue",
            title: "Overdue",
            icon: AlertTriangle,
            accentClass: "text-[var(--color-priority-urgent)]",
            count: grouped.overdue.length + grouped.overdueHabits.length,
            listContent: renderOverdueBucket(),
            boardContent: renderOverdueBucket("board"),
        },
        ...(grouped.timetableAnchors.length > 0 ? [{
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
            boardHeaderAction: hideTimetableAnchors ? (
                <button
                    type="button"
                    onClick={toggleTimetableAnchors}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-moonlit/20 bg-moonlit/10 text-moonlit transition-colors hover:bg-moonlit/14"
                    aria-label="Show timetable anchors"
                    title="Show timetable anchors"
                >
                    <Eye size={14} aria-hidden="true" />
                </button>
            ) : (
                <button
                    type="button"
                    onClick={toggleTimetableAnchors}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-moonlit/20 bg-moonlit/10 text-moonlit transition-colors hover:bg-moonlit/14"
                    aria-label="Hide timetable anchors"
                    title="Hide timetable anchors"
                >
                    <EyeOff size={14} aria-hidden="true" />
                </button>
            ),
            listSectionClassName: "rounded-[28px] border border-moonlit/20 bg-moonlit/[0.08] px-4 py-4 shadow-[0_18px_60px_rgba(7,14,26,0.18)]",
            boardSectionClassName: "border-moonlit/25 bg-moonlit/[0.08]",
            boardCollapsed: hideTimetableAnchors,
            listContent: renderTaskBucket(
                visibleTimetableAnchors,
                undefined,
                hideTimetableAnchors ? "Timetable anchors are hidden." : "No timetable anchors for today.",
            ),
            boardContent: renderTaskBucket(
                hideTimetableAnchors ? [] : grouped.timetableAnchors,
                "board",
                "No timetable anchors for today.",
            ),
        }] : []),
        {
            key: "today",
            title: "Today",
            icon: Sunrise,
            accentClass: "text-lantern",
            count: grouped.today.length,
            listContent: renderTaskBucket(grouped.today, undefined, "Nothing in today."),
            boardContent: renderTaskBucket(grouped.today, "board", "Nothing in today."),
        },
        ...(grouped.ritualsToday.length > 0 ? [{
            key: "rituals-today",
            title: "Rituals today",
            icon: Repeat,
            accentClass: "text-moonlit",
            count: visibleRitualsToday.length,
            headerAction: (
                <button
                    type="button"
                    onClick={toggleRitualsToday}
                    className="touch-target inline-flex min-h-11 items-center gap-2 rounded-2xl border border-moonlit/20 bg-moonlit/10 px-4 text-xs font-medium uppercase tracking-[0.14em] text-moonlit"
                    aria-pressed={hideRitualsToday}
                >
                    {hideRitualsToday ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                    {hideRitualsToday ? "Show" : "Hide"}
                </button>
            ),
            boardHeaderAction: hideRitualsToday ? (
                <button
                    type="button"
                    onClick={toggleRitualsToday}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-moonlit/20 bg-moonlit/10 text-moonlit transition-colors hover:bg-moonlit/14"
                    aria-label="Show rituals today"
                    title="Show rituals today"
                >
                    <Eye size={14} aria-hidden="true" />
                </button>
            ) : (
                <button
                    type="button"
                    onClick={toggleRitualsToday}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-moonlit/20 bg-moonlit/10 text-moonlit transition-colors hover:bg-moonlit/14"
                    aria-label="Hide rituals today"
                    title="Hide rituals today"
                >
                    <EyeOff size={14} aria-hidden="true" />
                </button>
            ),
            boardCollapsed: hideRitualsToday,
            listContent: renderHabitBucket(
                visibleRitualsToday,
                hideRitualsToday ? "Rituals are hidden." : "No rituals due today.",
            ),
            boardContent: renderHabitBucket(
                hideRitualsToday ? [] : grouped.ritualsToday,
                "No rituals due today.",
            ),
        }] : []),
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
            <PageContent width="default">
                <Suspense fallback={null}>
                    <LazyFocusViewBar />
                </Suspense>
            </PageContent>
            {view === "kanban" ? (
                <div className="flex-1 min-h-0 min-w-0">
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
                            <BucketedCollectionView
                                view={view}
                                sections={sections}
                                desktopColumnScroll
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
