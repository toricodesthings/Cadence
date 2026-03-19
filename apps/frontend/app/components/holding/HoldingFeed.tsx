import { useMemo, useState } from "react";
import { Inbox, ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { InboxList } from "../inbox/InboxList";
import { TaskCard } from "../tasks/TaskCard";
import type { InboxItem } from "../../types/inbox";
import type { Task } from "../../types/task";

interface HoldingFeedProps {
    inboxItems: InboxItem[];
    holdingTasks: Task[];
    selectedTaskId: string | null;
    selectedInboxItemId: string | null;
    onSelectTask: (taskId: string) => void;
    onSelectInboxItem: (itemId: string) => void;
}

/**
 * Unified Holding feed — the single stream for the inbox page.
 *
 * Layout per remediation plan:
 * 1. "To clarify" section: raw captures newest first (primary)
 * 2. "Ready to place" section: already-clarified unmanaged tasks (secondary, collapsible)
 *
 * Per Law 1: captures lead because that is the page's primary job.
 * Per H5: the page must foreground inbox items, not unscheduled tasks.
 */
export function HoldingFeed({ inboxItems, holdingTasks, selectedTaskId, selectedInboxItemId, onSelectTask, onSelectInboxItem }: HoldingFeedProps) {
    const [readyExpanded, setReadyExpanded] = useState(true);

    // Only show captures still in clarifying state (C5 — placed/discarded are resolved)
    const activeCaptures = useMemo(
        () => inboxItems.filter((item) => item.captureStatus === "clarifying"),
        [inboxItems],
    );

    // Ready to place = tasks that already exist but haven't been scheduled or placed in a project
    const readyToPlace = useMemo(() => holdingTasks, [holdingTasks]);

    const hasClarifyItems = activeCaptures.length > 0;
    const hasReadyItems = readyToPlace.length > 0;
    const totalBurden = activeCaptures.length + readyToPlace.length;
    const isEmpty = totalBurden === 0;

    if (isEmpty) {
        return (
            <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-twilight-border/50 bg-twilight-surface/20 px-6 py-16 text-center backdrop-blur-sm">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-twilight-surface/60 ring-1 ring-twilight-border/50">
                    <Inbox size={24} className="text-twilight-text-muted/70" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-medium text-twilight-text">
                    Your mind is clear.
                </h3>
                <p className="mt-2.5 max-w-sm text-[14px] leading-relaxed text-twilight-text-muted">
                    Capture anything — tasks, thoughts, reminders — and Cadence will help you place them.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            {/* ─── To clarify: Raw captures ─── */}
            {hasClarifyItems && (
                <section>
                    <SectionHeader
                        label="To clarify"
                        count={activeCaptures.length}
                        accentClassName="text-[var(--color-nav-inbox)]"
                    />
                    <div className="mt-3">
                        <InboxList
                            items={activeCaptures}
                            selectedItemId={selectedInboxItemId}
                            onSelectItem={onSelectInboxItem}
                        />
                    </div>
                </section>
            )}

            {/* ─── Ready to place: Unmanaged tasks ─── */}
            {hasReadyItems && (
                <section>
                    <button
                        type="button"
                        onClick={() => setReadyExpanded((v) => !v)}
                        className="group flex w-full items-center gap-3 cursor-pointer"
                        aria-expanded={readyExpanded}
                    >
                        <div className="inline-flex items-center gap-2 rounded-full border border-twilight-border/40 bg-twilight-surface/25 px-3 py-1.5 transition-colors group-hover:bg-twilight-surface/35">
                            {readyExpanded ? (
                                <ChevronDown size={12} className="text-twilight-text-muted" aria-hidden="true" />
                            ) : (
                                <ChevronRight size={12} className="text-twilight-text-muted" aria-hidden="true" />
                            )}
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft">
                                Ready to place
                            </span>
                            <span className="text-[12px] tabular-nums text-twilight-text-muted/90">{readyToPlace.length}</span>
                        </div>
                        <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] via-twilight-border/15 to-transparent" aria-hidden="true" />
                    </button>

                    <AnimatePresence initial={false}>
                        {readyExpanded && (
                            <motion.div
                                initial={{ opacity: 0, scaleY: 0.95 }}
                                animate={{ opacity: 1, scaleY: 1 }}
                                exit={{ opacity: 0, scaleY: 0.95 }}
                                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                style={{ transformOrigin: "top", willChange: "transform, opacity" }}
                            >
                                <div className="mt-3 flex flex-col gap-0.5">
                                    {readyToPlace.map((task) => (
                                        <TaskCard
                                            key={task.id}
                                            task={task}
                                            isSelected={selectedTaskId === task.id}
                                            onSelect={onSelectTask}
                                            holdingContext
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>
            )}

            {/* When only tasks exist (no captures) — gentle guidance */}
            {!hasClarifyItems && hasReadyItems && (
                <div className="rounded-[1.25rem] border border-twilight-border/30 bg-twilight-surface/12 px-5 py-4 text-center">
                    <p className="text-[13px] leading-relaxed text-twilight-text-muted">
                        No new captures. Use the field above to get anything out of your head.
                    </p>
                </div>
            )}
        </div>
    );
}

/** Holding section header — calm, atmospheric, consistent with Cadence's glass language */
function SectionHeader({
    label,
    count,
    accentClassName = "text-twilight-text-soft",
}: {
    label: string;
    count: number;
    accentClassName?: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-twilight-border/40 bg-twilight-surface/25 px-3 py-1.5">
                <h2 className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${accentClassName}`}>{label}</h2>
                <span className="text-[12px] tabular-nums text-twilight-text-muted/90">{count}</span>
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] via-twilight-border/15 to-transparent" aria-hidden="true" />
        </div>
    );
}
