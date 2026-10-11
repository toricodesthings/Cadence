import { Calendar } from "lucide-react";
import { formatDateSpan, formatShortDate, formatShortDateTime } from "../../lib/utils/date-format";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import type { ScheduleUpdates } from "./QuickScheduleSurface";

/** True when focus moved into a picker's popover or sheet, which renders outside the field that opened it. */
export const isPickerFocus = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && Boolean(target.closest('[data-cadence-popover-content="true"], [data-cadence-dialog-content="true"]'));

/**
 * The calendar button beside a new task's field (a list's add row, Capture): it shows the day the draft will save,
 * typed or picked, and opens the full picker. One control in both places, so the habit carries over.
 */
export function DeadlineTrigger({ schedule, onChange, compact = false }: {
    schedule: ScheduleUpdates;
    onChange: (updates: ScheduleUpdates) => void;
    compact?: boolean;
}) {
    const set = Boolean(schedule.dueDate || schedule.scheduledStart);
    const label = schedule.scheduledStart ? formatShortDateTime(schedule.scheduledStart)
        : schedule.dueDate && schedule.endDate ? formatDateSpan(schedule.dueDate, schedule.endDate)
        : schedule.dueDate ? formatShortDate(schedule.dueDate)
        : "Add date";
    return (
        <DeadlinePickerPopover
            dueDate={schedule.dueDate}
            endDate={schedule.endDate}
            scheduledStart={schedule.scheduledStart}
            scheduledEnd={schedule.scheduledEnd}
            recurrenceRule={schedule.recurrenceRule}
            onChange={onChange}
        >
            <button
                type="button"
                data-no-dnd="true"
                aria-label={set ? `Deadline: ${label}. Click to change` : "Add task date"}
                className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 ${compact ? "text-[10px]" : "text-[11px]"} font-medium transition-colors duration-200 ${set
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "text-twilight-text-muted/90 hover:bg-white/[0.04] hover:text-twilight-text-soft"}`}
            >
                <Calendar size={13} aria-hidden="true" />
                {label}
            </button>
        </DeadlinePickerPopover>
    );
}
