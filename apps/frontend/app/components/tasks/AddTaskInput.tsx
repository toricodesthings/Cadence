import { useState } from "react";
import { Plus, Calendar } from "lucide-react";
import { useCreateTask } from "../../hooks/tasks";
import { computeNextOrderIndex } from "../../lib/utils/order-index";
import { parseLocalDate } from "../../lib/utils/date-format";
import type { Task } from "../../types/task";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";

interface AddTaskInputProps {
    projectId?: string;
    tasks: Task[];
}

/** Input field for quick task creation — submits on Enter, optimistic insert */
export function AddTaskInput({
    projectId,
    tasks,
}: AddTaskInputProps) {
    const [value, setValue] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const [deadline, setDeadline] = useState<{
        dueDate: string | null;
        scheduledStart: string | null;
        scheduledEnd: string | null;
        recurrenceRule: string | null;
        isAllDay: boolean;
    }>({
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        recurrenceRule: null,
        isAllDay: true,
    });

    const createTask = useCreateTask();

    const handleSubmit = () => {
        if (!value.trim()) return;

        createTask.mutate({
            title: value.trim(),
            orderIndex: computeNextOrderIndex(tasks),
            dueDate: deadline.dueDate ?? undefined,
            scheduledStart: deadline.scheduledStart ?? undefined,
            scheduledEnd: deadline.scheduledEnd ?? undefined,
            recurrenceRule: deadline.recurrenceRule ?? undefined,
            isAllDay: deadline.isAllDay,
            ...(projectId && { projectId }),
        });

        setValue("");
        setDeadline({
            dueDate: null,
            scheduledStart: null,
            scheduledEnd: null,
            recurrenceRule: null,
            isAllDay: true,
        });
    };

    const hasDeadlineSet = !!(deadline.dueDate || deadline.scheduledStart);

    const deadlineLabel = (() => {
        if (deadline.scheduledEnd && deadline.dueDate) {
            const start = parseLocalDate(deadline.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const end = parseLocalDate(deadline.scheduledEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return `${start} – ${end}`;
        }
        if (deadline.dueDate) {
            return parseLocalDate(deadline.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        return 'Set date';
    })();

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
            }}
            className={`
                flex items-center gap-4 rounded-2xl border px-6 py-5
                transition-[color,background-color,border-color,box-shadow] duration-200
                ${isFocused
                    ? "border-lantern/20 bg-white/[0.03] shadow-[0_0_0_1px_rgba(232,164,74,0.08),0_4px_24px_rgba(232,164,74,0.04)]"
                    : "border-twilight-border bg-transparent hover:border-twilight-border-light"
                }
            `}
            aria-label="Add new task"
            data-focus-container
        >
            <Plus
                size={18}
                aria-hidden="true"
                className={`shrink-0 transition-colors duration-200 ${isFocused ? "text-lantern" : "text-twilight-text-muted"}`}
            />
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="What needs to be done?"
                aria-label="New task title"
                className="flex-1 bg-transparent text-base text-twilight-text outline-none placeholder:text-twilight-text-muted/80"
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        setValue("");
                        (e.target as HTMLInputElement).blur();
                    }
                }}
            />

            <DeadlinePickerPopover
                dueDate={deadline.dueDate}
                scheduledStart={deadline.scheduledStart}
                scheduledEnd={deadline.scheduledEnd}
                recurrenceRule={deadline.recurrenceRule}
                onChange={(updates) => setDeadline({ ...deadline, ...updates })}
            >
                <button
                    aria-label={hasDeadlineSet ? `Deadline: ${deadlineLabel}. Click to change` : "Set task deadline"}
                    className={`
                        flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium
                        transition-opacity transition-colors duration-200
                        ${hasDeadlineSet
                            ? "opacity-100 bg-lantern/10 text-lantern"
                            : isFocused
                                ? "opacity-100 text-twilight-text-muted/90 hover:bg-white/[0.05] hover:text-twilight-text-soft"
                                : "opacity-0 pointer-events-none text-twilight-text-muted/90"
                        }
                    `}
                    tabIndex={hasDeadlineSet || isFocused ? 0 : -1}
                >
                    <Calendar size={13} aria-hidden="true" />
                    {deadlineLabel}
                </button>
            </DeadlinePickerPopover>
        </form>
    );
}
