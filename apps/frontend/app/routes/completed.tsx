import { useTaskDetailSelection } from "../hooks/ui/use-task-detail-selection";
import { ShowOlder } from "../components/shared/ShowOlder";
import { MainLayout } from "../components/layout/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { CheckCircle2 } from "lucide-react";
import { PhoneTaskDetails, TaskDetailsRail } from "../components/shared/TaskDetailsPanels";
import { usePagedTasks } from "../hooks/tasks/use-tasks";
import { TaskCard } from "../components/tasks/TaskCard";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { PageContent } from "../components/layout/PageLayout";

export default function CompletedView() {
    const { data: tasks, isLoading, isFetching, loadMore } = usePagedTasks("COMPLETE");
    const selection = useTaskDetailSelection();
    const { selectedTaskId, setSelectedTaskId, handleSelectTask } = selection;



    const sidePanel = (
        <TaskDetailsRail selection={selection} ariaLabel="Resize completed sidebar" />
    );

    return (
        <MainLayout
            requireAuth
            hideContextualOrb
            sidePanel={sidePanel}
            sidePanelActive={Boolean(selectedTaskId)}
            onCloseSidePanel={() => setSelectedTaskId(null)}
            sidePanelLabel="Task"
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
                    <ShowOlder loadMore={loadMore} isFetching={isFetching} />
                </PageContent>
            </ScrollAreaWrapper>

            <PhoneTaskDetails selection={selection} ariaLabel="Completed task details" clearOnClose />
        </MainLayout>
    );
}
