import { useMemo } from "react";
import { CalendarDays, CheckSquare, Inbox as InboxIcon } from "lucide-react";
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
        <div className="aurora-accent flex h-full flex-col bg-twilight-deep/95 backdrop-blur-xl">
            {/* Header — mirrors the Cadence panel header so the two rail panes read
                as siblings (same height, font-display title, lantern-glow icon). */}
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-twilight-border px-4">
                <div className="flex h-9 w-9 min-w-9 items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary ring-1 ring-accent-primary/25 glow-lantern">
                    <CalendarDays size={17} />
                </div>
                <div className="leading-tight">
                    <h2 className="font-display text-lg font-semibold leading-tight tracking-tight text-twilight-text">
                        Overview
                    </h2>
                    <span className="mt-0.5 block text-[11px] font-medium leading-none text-twilight-text-muted">
                        Plan &amp; place
                    </span>
                </div>
            </header>

            <ScrollAreaWrapper>
                <div className="flex min-h-full flex-col px-5 py-5">
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
        </div>
    );
}
