import { MainLayout } from "../components/MainLayout";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { Sparkles } from "lucide-react";
import { CalendarView } from "../components/calendar/CalendarView";
import { useInbox } from "../hooks/inbox";
import { InboxList } from "../components/inbox/InboxList";
import { InboxBoard } from "../components/inbox/InboxBoard";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { GeneralPageHeader } from "../components/layout/GeneralPageHeader";
import { ViewToggle } from "../components/shared/ViewToggle";
import { useState } from "react";

export default function InboxView() {
    const { data: inboxItems, isLoading } = useInbox();
    const [view, setView] = useState<"list" | "kanban">("list");

    const sidePanel = (
        <ResizableSidePanel ariaLabel="Resize inbox sidebar">
            <ScrollAreaWrapper>
                <div className="p-5">
                    <CalendarView />
                </div>
            </ScrollAreaWrapper>
        </ResizableSidePanel>
    );

    return (
        <MainLayout requireAuth sidePanel={sidePanel} headerCenter={<ViewToggle view={view} onViewChange={setView} />}>
            <ScrollAreaWrapper>
                <div className="max-w-2xl mx-auto px-8 py-8">
                    <GeneralPageHeader
                        icon={Sparkles}
                        title="Inbox"
                        description="Unload your thoughts — they'll wait for you here."
                    />

                    {isLoading ? (
                        <TaskListSkeleton />
                    ) : inboxItems && inboxItems.length > 0 ? (
                        view === "list" ? (
                            <InboxList items={inboxItems} />
                        ) : (
                            <div className="-mx-8">
                                <InboxBoard items={inboxItems} />
                            </div>
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 px-4 text-center group">
                            <div className="w-16 h-16 rounded-full bg-twilight-surface ring-1 ring-twilight-border flex items-center justify-center mb-6 relative overflow-hidden">
                                <div className="absolute inset-0 bg-lantern/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                                <Sparkles size={24} className="text-lantern/60 animate-in fade-in duration-1000" />
                            </div>
                            <h3 className="text-lg font-medium text-twilight-text mb-2">Nothing waiting.</h3>
                            <p className="text-twilight-text-muted text-sm max-w-sm">
                                Your mind is clear.
                            </p>
                        </div>
                    )}
                </div>
            </ScrollAreaWrapper>
        </MainLayout>
    );
}
