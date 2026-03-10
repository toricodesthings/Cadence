import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MainLayout } from "../components/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { CheckCircle2 } from "lucide-react";
import { CalendarView } from "../components/calendar/CalendarView";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { useTasks } from "../hooks/tasks";
import { TaskList } from "../components/tasks/TaskList";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { PageContent } from "../components/layout/page-layout";

export default function CompletedView() {
    const { data: tasks, isLoading } = useTasks({ state: "COMPLETE" });
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

    return (
        <MainLayout
            requireAuth
            sidePanel={sidePanel}
            contentWidth="default"
            shellHeader={{
                title: "Completed",
                eyebrow: "Archive",
                icon: <CheckCircle2 size={18} aria-hidden="true" />,
                accentColor: "var(--color-lantern)",
            }}
        >
            <ScrollAreaWrapper>
                <PageContent width="default">
                    {isLoading ? (
                        <TaskListSkeleton />
                    ) : tasks && tasks.length > 0 ? (
                        <TaskList
                            tasks={tasks}
                            selectedTaskId={selectedTaskId}
                            onSelectTask={handleSelectTask}
                        />
                    ) : (
                        <EmptyState />
                    )}
                </PageContent>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
