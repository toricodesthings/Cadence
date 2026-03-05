import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MainLayout } from "../components/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ViewToggle } from "../components/shared/ViewToggle";
import { CalendarRange } from "lucide-react";
import { CalendarView } from "../components/calendar/CalendarView";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { useTasks } from "../hooks/tasks";
import { SectionedTaskList } from "../components/tasks/SectionedTaskList";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { useViewMode } from "../hooks/use-view-mode";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { toISODate, formatDateLabel } from "../lib/utils/date-format";
import { GeneralPageHeader } from "../components/layout/GeneralPageHeader";

export default function Upcoming() {
    const { data: tasks, isLoading } = useTasks({ state: "ACTIVE" });
    const { view, setView } = useViewMode();
    const { activeTagId } = useTagFilterStore();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    const todayISO = toISODate(new Date());

    const tagFilteredTasks = activeTagId
        ? (tasks ?? []).filter(t => (t as any).tagIds?.includes(activeTagId))
        : (tasks ?? []);

    const upcomingTasks = tagFilteredTasks.filter(t => {
        if (!t.scheduledStart) return false;
        const tIso = t.scheduledStart.split("T")[0];
        return tIso > todayISO;
    });

    // Group by date for list view
    const groupedTasks = upcomingTasks.reduce<Record<string, typeof upcomingTasks>>((acc, task) => {
        const dateKey = task.scheduledStart!.split("T")[0];
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(task);
        return acc;
    }, {});

    const sortedDates = Object.keys(groupedTasks).sort();

    const handleSelectTask = (id: string) => setSelectedTaskId(id === selectedTaskId ? null : id);

    const sidePanel = (
        <ResizableSidePanel ariaLabel="Resize upcoming sidebar">
            <AnimatePresence mode="wait">
                {selectedTaskId ? (
                    <TaskEditPanel
                        key={`edit-${selectedTaskId}`}
                        taskId={selectedTaskId}
                        onClose={() => setSelectedTaskId(null)}
                    />
                ) : (
                    <ScrollAreaWrapper key="calendar">
                        <div className="p-5">
                            <CalendarView />
                        </div>
                    </ScrollAreaWrapper>
                )}
            </AnimatePresence>
        </ResizableSidePanel>
    );

    const headerCenter = <ViewToggle view={view} onViewChange={setView} />;

    return (
        <MainLayout requireAuth sidePanel={sidePanel} headerCenter={headerCenter}>
            {view === "list" ? (
                <ScrollAreaWrapper>
                    <div className="max-w-2xl mx-auto px-8 py-8">
                        <GeneralPageHeader
                            icon={CalendarRange}
                            title="Upcoming"
                            description="Plan your future tasks"
                        />

                        {isLoading ? (
                            <TaskListSkeleton />
                        ) : sortedDates.length > 0 ? (
                            <div className="flex flex-col gap-10">
                                {sortedDates.map(date => (
                                    <div key={date}>
                                        <h3 className="text-[13px] font-medium text-twilight-text-muted uppercase tracking-wider mb-3">
                                            {formatDateLabel(new Date(`${date}T12:00:00Z`))}
                                        </h3>
                                        <SectionedTaskList
                                            tasks={groupedTasks[date]}
                                            selectedTaskId={selectedTaskId}
                                            onSelectTask={handleSelectTask}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                                <div className="w-16 h-16 rounded-full bg-twilight-surface ring-1 ring-twilight-border flex items-center justify-center mb-6">
                                    <CalendarRange size={24} className="text-twilight-text-muted" />
                                </div>
                                <h3 className="text-lg font-medium text-twilight-text mb-2">No upcoming tasks</h3>
                                <p className="text-twilight-text-muted text-sm max-w-sm">
                                    Future tasks will appear here as you schedule them out.
                                </p>
                            </div>
                        )}
                    </div>
                </ScrollAreaWrapper>
            ) : (
                <div className="h-full flex flex-col overflow-hidden">
                    <div className="px-8 pt-8 shrink-0">
                        <GeneralPageHeader
                            icon={CalendarRange}
                            title="Upcoming"
                            description="Plan your future tasks"
                        />
                    </div>
                    <div className="flex-1 min-h-0">
                        <KanbanBoard
                            tasks={upcomingTasks}
                            selectedTaskId={selectedTaskId}
                            onSelectTask={handleSelectTask}
                        />
                    </div>
                </div>
            )}
        </MainLayout>
    );
}
