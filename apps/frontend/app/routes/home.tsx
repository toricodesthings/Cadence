import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, PanelRightClose, Sunrise } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { MainLayout } from "../components/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { CalendarView } from "../components/calendar/CalendarView";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { TaskList } from "../components/tasks/TaskList";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { PageContent } from "../components/layout/page-layout";
import { ViewToggle } from "../components/shared/ViewToggle";
import { useTasks } from "../hooks/tasks";
import { useDocumentMeta } from "../hooks/use-document-meta";
import { useShellMode } from "../hooks/use-shell-mode";
import { useViewMode } from "../hooks/use-view-mode";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { toISODate } from "../lib/utils/date-format";
import { getTaskEffectiveAnchor } from "../lib/utils/task-scheduling";
import type { Task } from "../types/task";

function TodaySection({
    title,
    icon: Icon,
    accentClass,
    tasks,
    selectedTaskId,
    onSelectTask,
}: {
    title: string;
    icon: typeof AlertTriangle;
    accentClass: string;
    tasks: Task[];
    selectedTaskId: string | null;
    onSelectTask: (taskId: string) => void;
}) {
    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <Icon size={14} className={accentClass} aria-hidden="true" />
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                        {title}
                    </h2>
                </div>
                <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{tasks.length}</span>
                <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
            </div>

            {tasks.length > 0 ? (
                <TaskList tasks={tasks} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} />
            ) : (
                <div className="px-6 py-3 text-[13px] italic text-twilight-text-muted/65">
                    Nothing in {title.toLowerCase()}.
                </div>
            )}
        </section>
    );
}

export default function Home() {
    const shell = useShellMode();
    const { view, setView } = useViewMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const todayISO = toISODate(new Date());
    const { activeTagId } = useTagFilterStore();

    useDocumentMeta(
        "Today · Cadence",
        "Review overdue work and today's commitments in one calm, focused viewer.",
    );

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

        for (const task of filteredTasks) {
            const anchor = getTaskEffectiveAnchor(task);
            if (!anchor) continue;
            if (anchor < todayISO) overdue.push(task);
            if (anchor === todayISO) today.push(task);
        }

        const sortByAnchor = (a: Task, b: Task) => {
            const anchorA = getTaskEffectiveAnchor(a) ?? "";
            const anchorB = getTaskEffectiveAnchor(b) ?? "";
            if (anchorA !== anchorB) return anchorA.localeCompare(anchorB);
            if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
            return a.orderIndex - b.orderIndex;
        };

        overdue.sort(sortByAnchor);
        today.sort(sortByAnchor);

        return { overdue, today };
    }, [filteredTasks, todayISO]);

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId((current) => (current === taskId ? null : taskId));
        if (!shell.isWide) {
            setMobilePanelOpen(true);
        }
    };

    const sidePanel = (
        <ResizableSidePanel ariaLabel="Resize today sidebar">
            <AnimatePresence mode="wait">
                {selectedTaskId ? (
                    <TaskEditPanel
                        key={`today-edit-${selectedTaskId}`}
                        taskId={selectedTaskId}
                        onClose={() => setSelectedTaskId(null)}
                    />
                ) : (
                    <ScrollAreaWrapper key="today-calendar">
                        <div className="p-5">
                            <CalendarView />
                        </div>
                    </ScrollAreaWrapper>
                )}
            </AnimatePresence>
        </ResizableSidePanel>
    );

    const headerRight = !shell.isWide ? (
        <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-twilight-border px-4 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
            aria-label={selectedTaskId ? "Open task details" : "Open today calendar"}
        >
            {selectedTaskId ? <PanelRightClose size={16} aria-hidden="true" /> : <CalendarDays size={16} aria-hidden="true" />}
            {selectedTaskId ? "Details" : "Calendar"}
        </button>
    ) : undefined;

    const totalVisible = grouped.overdue.length + grouped.today.length;

    return (
        <MainLayout
            requireAuth
            sidePanel={sidePanel}
            headerCenter={<ViewToggle view={view} onViewChange={setView} />}
            headerRight={headerRight}
            contentWidth="default"
            shellHeader={{
                title: "Today",
                eyebrow: "Focus",
                icon: <Sunrise size={18} aria-hidden="true" />,
                accentColor: "var(--color-nav-planner)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="default">
                    {isLoading ? (
                        <TaskListSkeleton />
                    ) : totalVisible > 0 ? (
                        <div className="flex flex-col gap-8">
                            {view === "list" ? (
                                <>
                                    <TodaySection
                                        title="Overdue"
                                        icon={AlertTriangle}
                                        accentClass="text-[var(--color-priority-urgent)]"
                                        tasks={grouped.overdue}
                                        selectedTaskId={selectedTaskId}
                                        onSelectTask={handleSelectTask}
                                    />
                                    <TodaySection
                                        title="Today"
                                        icon={Sunrise}
                                        accentClass="text-lantern"
                                        tasks={grouped.today}
                                        selectedTaskId={selectedTaskId}
                                        onSelectTask={handleSelectTask}
                                    />
                                </>
                            ) : (
                                <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
                                    <div className="flex min-w-max gap-4">
                                    <section className="w-[min(25rem,82vw)] shrink-0 rounded-[28px] border border-twilight-border/50 bg-twilight-surface/20 p-4">
                                        <div className="mb-3 flex items-center gap-3">
                                            <AlertTriangle size={14} className="text-[var(--color-priority-urgent)]" aria-hidden="true" />
                                            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Overdue</h2>
                                            <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{grouped.overdue.length}</span>
                                        </div>
                                        <TaskList
                                            tasks={grouped.overdue}
                                            selectedTaskId={selectedTaskId}
                                            onSelectTask={handleSelectTask}
                                            cardVariant="board"
                                        />
                                    </section>
                                    <section className="w-[min(25rem,82vw)] shrink-0 rounded-[28px] border border-twilight-border/50 bg-twilight-surface/20 p-4">
                                        <div className="mb-3 flex items-center gap-3">
                                            <Sunrise size={14} className="text-lantern" aria-hidden="true" />
                                            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">Today</h2>
                                            <span className="text-[12px] tabular-nums text-twilight-text-muted/70">{grouped.today.length}</span>
                                        </div>
                                        <TaskList
                                            tasks={grouped.today}
                                            selectedTaskId={selectedTaskId}
                                            onSelectTask={handleSelectTask}
                                            cardVariant="board"
                                        />
                                    </section>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
                            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-twilight-surface ring-1 ring-twilight-border">
                                <Sunrise size={24} className="text-lantern" />
                            </div>
                            <h3 className="mb-2 text-lg font-medium text-twilight-text">Nothing pressing today.</h3>
                            <p className="max-w-sm text-sm text-twilight-text-muted">
                                Overdue work and today&apos;s scheduled tasks will gather here automatically.
                            </p>
                        </div>
                    )}
                </PageContent>
            </ScrollAreaWrapper>

            {!shell.isWide && (
                <ResponsiveOverlayPanel
                    ariaLabel={selectedTaskId ? "Today details" : "Today calendar"}
                    open={mobilePanelOpen}
                    onClose={() => setMobilePanelOpen(false)}
                    title={selectedTaskId ? "Task details" : "Calendar"}
                >
                    <AnimatePresence mode="wait">
                        {selectedTaskId ? (
                            <TaskEditPanel
                                key={`today-mobile-edit-${selectedTaskId}`}
                                taskId={selectedTaskId}
                                onClose={() => {
                                    setSelectedTaskId(null);
                                    setMobilePanelOpen(false);
                                }}
                            />
                        ) : (
                            <ScrollAreaWrapper key="today-mobile-calendar">
                                <div className="p-5">
                                    <CalendarView />
                                </div>
                            </ScrollAreaWrapper>
                        )}
                    </AnimatePresence>
                </ResponsiveOverlayPanel>
            )}
        </MainLayout>
    );
}
