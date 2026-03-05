import { MainLayout } from "../components/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { Trash2 } from "lucide-react";
import { CalendarView } from "../components/calendar/CalendarView";
import { useTasks } from "../hooks/tasks";
import { TaskList } from "../components/tasks/TaskList";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { GeneralPageHeader } from "../components/layout/GeneralPageHeader";

export default function TrashView() {
    const { data: tasks, isLoading } = useTasks({ state: "ARCHIVED" });

    const sidePanel = (
        <ResizableSidePanel ariaLabel="Resize trash sidebar">
            <ScrollAreaWrapper>
                <div className="p-5">
                    <CalendarView />
                </div>
            </ScrollAreaWrapper>
        </ResizableSidePanel>
    );

    return (
        <MainLayout requireAuth sidePanel={sidePanel}>
            <ScrollAreaWrapper>
                <div className="max-w-2xl mx-auto px-8 py-8">
                    <GeneralPageHeader
                        icon={Trash2}
                        title="Trash"
                        description="Deleted items"
                    />

                    {isLoading ? (
                        <TaskListSkeleton />
                    ) : tasks && tasks.length > 0 ? (
                        <TaskList tasks={tasks} />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                            <div className="w-16 h-16 rounded-full bg-twilight-surface ring-1 ring-twilight-border flex items-center justify-center mb-6">
                                <Trash2 size={24} className="text-twilight-text-muted" />
                            </div>
                            <h3 className="text-lg font-medium text-twilight-text mb-2">Trash is empty</h3>
                            <p className="text-twilight-text-muted text-sm max-w-sm">
                                Deleted tasks will be stored here before being permanently removed.
                            </p>
                        </div>
                    )}
                </div>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
