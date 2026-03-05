import { X, Calendar, CheckSquare, Trash2, CalendarDays } from "lucide-react";
import { useTaskSelection } from "../../stores/task-selection-store";
import { useBatchStateTransition, useBatchDeleteTasks, useBatchRescheduleTasks } from "../../hooks/tasks/use-batch-state";
import { toast } from "sonner";
import * as Popover from "../primitives/Popover";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";

export function FloatingActionBar() {
    const { selectedTaskIds, clearSelection } = useTaskSelection();

    // Convert Set back to Array for hooks
    const selectedArray = Array.from(selectedTaskIds);

    const count = selectedArray.length;

    const batchState = useBatchStateTransition();
    const batchDelete = useBatchDeleteTasks();
    const batchReschedule = useBatchRescheduleTasks();

    if (count === 0) return null;

    const handleMarkComplete = () => {
        batchState.mutate(
            { taskIds: selectedArray, state: "COMPLETE" },
            {
                onSuccess: () => {
                    toast.success(`Marked ${count} tasks complete`);
                    clearSelection();
                }
            }
        );
    };

    const handleDelete = () => {
        batchDelete.mutate(
            { taskIds: selectedArray },
            {
                onSuccess: () => {
                    toast.success(`Deleted ${count} tasks`);
                    clearSelection();
                }
            }
        );
    };

    const handleReschedule = (updates: any) => {
        if (!updates.scheduledStart) return;
        batchReschedule.mutate(
            {
                taskIds: selectedArray,
                scheduledStart: updates.scheduledStart,
                isAllDay: updates.isAllDay ?? true
            },
            {
                onSuccess: () => {
                    toast.success(`Rescheduled ${count} tasks`);
                    clearSelection();
                }
            }
        );
    };

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 p-1.5 rounded-2xl bg-twilight-surface shadow-2xl border border-twilight-border animate-in slide-in-from-bottom-5 fade-in duration-300">
            {/* Count Badge */}
            <div className="flex items-center justify-center gap-2 pl-3 pr-2 border-r border-twilight-border/50">
                <span className="flex h-5 items-center justify-center rounded-full bg-lantern/20 px-2 text-[11px] font-bold text-lantern tracking-wide">
                    {count}
                </span>
                <span className="text-[11px] font-medium text-twilight-text-muted uppercase tracking-wide">
                    selected
                </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 px-1">
                <button
                    onClick={handleMarkComplete}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                    <CheckSquare size={14} className="opacity-80" />
                    Complete
                </button>

                <DeadlinePickerPopover
                    dueDate={null}
                    scheduledStart={null}
                    recurrenceRule={null}
                    onChange={handleReschedule}
                >
                    <button className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-white">
                        <Calendar size={14} className="opacity-80" />
                        Reschedule
                    </button>
                </DeadlinePickerPopover>

                <button
                    onClick={handleDelete}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-rose-400 opacity-90 transition-colors hover:bg-white/[0.04] hover:opacity-100"
                >
                    <Trash2 size={14} />
                    Delete
                </button>
            </div>

            {/* Dismiss */}
            <div className="pl-1 pr-1 border-l border-twilight-border/50 cursor-pointer">
                <button
                    onClick={clearSelection}
                    className="flex h-7 w-7 items-center justify-center rounded-xl text-twilight-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
                    aria-label="Clear selection"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
