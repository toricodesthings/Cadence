import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MainLayout } from "../components/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ViewToggle } from "../components/shared/ViewToggle";
import { CheckCircle2 } from "lucide-react";
import { CalendarView } from "../components/calendar/CalendarView";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { useTasks } from "../hooks/tasks";
import { SectionedTaskList } from "../components/tasks/SectionedTaskList";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { useViewMode } from "../hooks/use-view-mode";
import { GeneralPageHeader } from "../components/layout/GeneralPageHeader";

export default function CompletedView() {
    const { data: tasks, isLoading } = useTasks({ state: "COMPLETE" });
    const { view, setView } = useViewMode();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    const handleSelectTask = (id: string) => setSelectedTaskId(id === selectedTaskId ? null : id);

    const sidePanel = (
        <ResizableSidePanel ariaLabel="Resize completed sidebar">
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
                            icon={CheckCircle2}
                            title="Completed"
                            description="Look back at your achievements"
                            iconGlowClass="glow-lantern"
                        />

                        {isLoading ? (
                            <TaskListSkeleton />
                        ) : tasks && tasks.length > 0 ? (
                            <SectionedTaskList
                                tasks={tasks}
                                selectedTaskId={selectedTaskId}
                                onSelectTask={handleSelectTask}
                            />
                        ) : (
                            <EmptyState />
                        )}
                    </div>
                </ScrollAreaWrapper>
            ) : (
                <div className="h-full flex flex-col overflow-hidden">
                    <div className="px-8 pt-8 shrink-0">
                        <GeneralPageHeader
                            icon={CheckCircle2}
                            title="Completed"
                            description="Look back at your achievements"
                            iconGlowClass="glow-lantern"
                        />
                    </div>
                    <div className="flex-1 min-h-0">
                        <KanbanBoard
                            tasks={tasks ?? []}
                            selectedTaskId={selectedTaskId}
                            onSelectTask={handleSelectTask}
                        />
                    </div>
                </div>
            )}
        </MainLayout>
    );
}
