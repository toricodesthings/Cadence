import { useState } from "react";
import { Bell } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import { useSettings } from "../../hooks/core/use-settings";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { deadlineReminderAt } from "../../lib/notifications/reminder-engine";
import { formatShortDateTime } from "../../lib/utils/date-format";
import { Switch } from "../primitives/Switch";
import { FieldRow, VALUE_BTN } from "../shared/DetailPanelSections";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";

/** Personal reminder row shared by `TaskEditor` and `TaskViewPanel` (reminders are per-person on shared tasks). */
export function TaskReminderRow({ task }: { task: Task }) {
    const [reminderOpen, setReminderOpen] = useState(false);
    const { data: settings } = useSettings();
    const updateTask = useUpdateTask();
    const deadlineInstant = deadlineReminderAt(task, settings?.notifications?.morningTime ?? "09:00");

    const setReminder = (reminderAt: string | null) =>
        updateTask.mutate({ id: task.id, reminderAt, reminderSilenced: false });

    const handleReminderSwitch = (on: boolean) => {
        if (!on) return setReminder(null);
        if (deadlineInstant) return setReminder(deadlineInstant);
        setReminderOpen(true);
    };

    return (
        <FieldRow icon={Bell} label="Reminder">
            <div className="flex items-center gap-2">
                <DeadlinePickerPopover
                    variant="moment"
                    open={reminderOpen}
                    onOpenChange={setReminderOpen}
                    dueDate={null}
                    scheduledStart={task.reminderAt ?? deadlineInstant}
                    recurrenceRule={null}
                    onChange={(updates) => setReminder(updates.scheduledStart)}
                >
                    <button
                        type="button"
                        className={`${VALUE_BTN} ${task.reminderAt ? "" : "text-twilight-text-muted"}`}
                    >
                        {task.reminderAt ? formatShortDateTime(task.reminderAt) : "None"}
                    </button>
                </DeadlinePickerPopover>
                <Switch
                    checked={Boolean(task.reminderAt)}
                    onCheckedChange={handleReminderSwitch}
                    aria-label={task.reminderAt ? "Remove reminder" : "Set reminder"}
                />
            </div>
        </FieldRow>
    );
}
