import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MainLayout } from "../components/layout/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { CheckCircle2 } from "lucide-react";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { useTasks } from "../hooks/tasks";
import { TaskCard } from "../components/tasks/TaskCard";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { PageContent } from "../components/layout/PageLayout";
import { useShellMode } from "../hooks/ui/use-shell-mode";

export default function CompletedView() {
    const shell = useShellMode();
    const { data: tasks, isLoading } = useTasks({ state: "COMPLETE" });
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");

    const handleSelectTask = (id: string) => {
        const nextId = id === selectedTaskId ? null : id;
        setSelectedTaskId(nextId);

        if (!shell.isWide) {
            setMobileDetailMode("peek");
            setMobilePanelOpen(Boolean(nextId));
        }
    };

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
                accentColor: "var(--accent-primary)",
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

            {!shell.isWide && selectedTaskId && (
                <ResponsiveOverlayPanel
                    ariaLabel="Completed task details"
                    open={mobilePanelOpen}
                    onClose={() => {
                        setMobilePanelOpen(false);
                        setSelectedTaskId(null);
                    }}
                    mode={mobileDetailMode}
                >
                    <TaskEditPanel
                        key={`completed-mobile-edit-${selectedTaskId}`}
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
