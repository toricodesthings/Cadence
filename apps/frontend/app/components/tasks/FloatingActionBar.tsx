import { X, Calendar, CheckSquare, Trash2, CalendarDays, Sun, Moon, ArrowRight } from "lucide-react";
import { useTaskSelectionStore } from "../../stores/task-selection-store";
import { useBatchStateTransition, useBatchDeleteTasks, useBatchRescheduleTasks } from "../../hooks/tasks/use-batch-state";
import { toast } from "sonner";
import * as Popover from "../primitives/Popover";
import { Button } from "../primitives/Button";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { toISODate, addDays } from "../../lib/utils/date-format";

export function FloatingActionBar() {
    const { selectedTaskIds, clearSelection } = useTaskSelectionStore();

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

    const handleQuickReschedule = (daysFromNow: number) => {
        const target = toISODate(addDays(new Date(), daysFromNow));
        batchReschedule.mutate(
            { taskIds: selectedArray, scheduledStart: target, isAllDay: true },
            {
                onSuccess: () => {
                    toast.success(`Rescheduled ${count} tasks`);
                    clearSelection();
                },
            },
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
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkComplete}
                    className="shrink-0 text-twilight-text-soft hover:text-white"
                >
                    <CheckSquare size={14} className="opacity-80" />
                    Complete
                </Button>

                {/* Quick reschedule presets */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickReschedule(0)}
                    className="shrink-0 text-twilight-text-soft hover:text-white"
                >
                    <Sun size={14} className="opacity-80" />
                    Today
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickReschedule(1)}
                    className="shrink-0 text-twilight-text-soft hover:text-white"
                >
                    <Moon size={14} className="opacity-80" />
                    Tomorrow
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickReschedule(7)}
                    className="shrink-0 text-twilight-text-soft hover:text-white hidden sm:flex"
                >
                    <ArrowRight size={14} className="opacity-80" />
                    Next week
                </Button>

                <DeadlinePickerPopover
                    dueDate={null}
                    scheduledStart={null}
                    recurrenceRule={null}
                    onChange={handleReschedule}
                >
                    <Button variant="ghost" size="sm" className="shrink-0 text-twilight-text-soft hover:text-white">
                        <Calendar size={14} className="opacity-80" />
                        Reschedule
                    </Button>
                </DeadlinePickerPopover>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    className="shrink-0 text-rose-400 opacity-90 hover:opacity-100"
                >
                    <Trash2 size={14} />
                    Delete
                </Button>
            </div>

            {/* Dismiss */}
            <div className="pl-1 pr-1 border-l border-twilight-border/50">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearSelection}
                    aria-label="Clear selection"
                    className="h-7 w-7 hover:text-white"
                >
                    <X size={14} />
                </Button>
            </div>
        </div>
    );
}
