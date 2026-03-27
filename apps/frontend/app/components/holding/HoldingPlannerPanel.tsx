import { useMemo } from "react";
import { CheckSquare, Inbox as InboxIcon } from "lucide-react";
import { CalendarView } from "../calendar/CalendarView";
import { ScrollAreaWrapper } from "../shared/ScrollAreaWrapper";
import { useInbox } from "../../hooks/inbox";
import { useTasks } from "../../hooks/tasks";

export function HoldingPlannerPanel() {
    const { data: inboxItems = [] } = useInbox();
    const { data: allTasks = [] } = useTasks({});

    const unmanagedCount = useMemo(
        () => allTasks.filter((task) => task.state === "ACTIVE" && !task.projectId && !task.sectionId && !task.dueDate && !task.scheduledStart).length,
        [allTasks],
    );
    const unprocessedCount = useMemo(
        () => inboxItems.filter((item) => !item.processed).length,
        [inboxItems],
    );

    return (
        <ScrollAreaWrapper>
            <div className="flex min-h-full flex-col px-5 py-5">
                <div className="mb-4 px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-muted">
                        Overview
                    </p>
                </div>

                <CalendarView />

                <div className="mt-4 rounded-[1.5rem] border border-twilight-border/35 bg-twilight-surface/16 px-4 py-3 backdrop-blur-xl">
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-twilight-text-muted">
                        <div className="inline-flex items-center gap-2 rounded-full border border-twilight-border/35 bg-white/[0.03] px-3 py-1.5">
                            <CheckSquare size={12} className="text-accent-primary" aria-hidden="true" />
                            <span>Awaiting placement</span>
                            <span className="text-twilight-text">{unmanagedCount}</span>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-twilight-border/35 bg-white/[0.03] px-3 py-1.5">
                            <InboxIcon size={12} className="text-moonlit" aria-hidden="true" />
                            <span>To clarify</span>
                            <span className="text-twilight-text">{unprocessedCount}</span>
                        </div>
                    </div>
                </div>
            </div>
        </ScrollAreaWrapper>
    );
}
