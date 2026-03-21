import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MainLayout } from "../components/layout/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { CheckCircle2 } from "lucide-react";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { useTasks } from "../hooks/tasks";
import { TaskCard } from "../components/tasks/TaskCard";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { PageContent } from "../components/layout/PageLayout";

export default function CompletedView() {
    const { data: tasks, isLoading } = useTasks({ state: "COMPLETE" });
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    const handleSelectTask = (id: string) => setSelectedTaskId(id === selectedTaskId ? null : id);

    const sidePanel = selectedTaskId ? (
        <ResizableSidePanel ariaLabel="Resize completed sidebar">
            <AnimatePresence mode="wait">
                <TaskEditPanel
                    key={`edit-${selectedTaskId}`}
                    taskId={selectedTaskId}
                    onClose={() => setSelectedTaskId(null)}
                />
            </AnimatePresence>
        </ResizableSidePanel>
    ) : undefined;

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
                        <div className="flex flex-col gap-1">
                            {tasks.map((task) => (
                                <TaskCard
                                    key={task.id}
                                    task={task}
                                    isSelected={task.id === selectedTaskId}
                                    onSelect={handleSelectTask}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState variant="completed" />
                    )}
                </PageContent>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
